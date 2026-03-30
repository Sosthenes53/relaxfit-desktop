import { useEffect, useRef, useState } from 'react'
import { BLEService, DiscoveredChar } from '../services/bleService'
import { BLEStatus } from '../types'

interface UseBluetoothOptions {
  onDataReceived?: (data: DataView, serviceUUID: string, charUUID: string) => void
  onDiscovery?: (chars: DiscoveredChar[]) => void
}

export function useBluetooth(deviceAddress: string | null, options: UseBluetoothOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState<BLEStatus>('idle')
  const [discoveredChars, setDiscoveredChars] = useState<DiscoveredChar[]>([])
  const bleServiceRef = useRef<BLEService | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Cleanup previous connection
    if (bleServiceRef.current) {
      bleServiceRef.current.disconnect()
      bleServiceRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsConnected(false)
    setStatus('idle')
    setDiscoveredChars([])

    if (!deviceAddress) {
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const bleService = new BLEService(
      (newStatus) => {
        setStatus(newStatus)
        if (newStatus === 'connected') {
          setIsConnected(true)
        } else if (newStatus === 'disconnected') {
          setIsConnected(false)
        }
      },
      options.onDataReceived || (() => {}),
      (chars) => {
        setDiscoveredChars(prev => [...prev, ...chars])
        options.onDiscovery?.(chars)
      }
    )
    bleServiceRef.current = bleService

    const connect = async () => {
      try {
        await bleService.scanFiltered(controller.signal)
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('BLE connection failed:', err)
          setStatus('error')
        }
      }
    }

    connect()

    return () => {
      controller.abort()
      if (bleServiceRef.current) {
        bleServiceRef.current.disconnect()
        bleServiceRef.current = null
      }
      setIsConnected(false)
      setStatus('disconnected')
      setDiscoveredChars([])
    }
  }, [deviceAddress, options.onDataReceived, options.onDiscovery])

  const sendCommand = async (serviceUUID: string, charUUID: string, bytes: number[]) => {
    if (!bleServiceRef.current) throw new Error('BLE service not initialized')
    return bleServiceRef.current.sendCommand(serviceUUID, charUUID, bytes)
  }

  const disconnect = async () => {
    if (bleServiceRef.current) {
      await bleServiceRef.current.disconnect()
    }
  }

  return {
    isConnected,
    status,
    discoveredChars,
    sendCommand,
    disconnect
  }
}