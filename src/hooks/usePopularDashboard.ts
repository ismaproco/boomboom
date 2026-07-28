import { useRef, useState, type RefObject } from 'react'
import { newsApi } from '../api'
import type { PopularResponse, PopularSnapshotSummary } from '../types'
import { getEmptyPopular } from './dashboardEmptyState'
import { isAbortError, type RequestKey } from './useAbortableRequest'

type AbortApi = {
  createRequestSignal: (key: RequestKey) => AbortSignal
  clearRequestSignal: (key: RequestKey, signal: AbortSignal) => void
}

export function usePopularDashboard(isMountedRef: RefObject<boolean>, abort: AbortApi) {
  const [popular, setPopular] = useState<PopularResponse>(getEmptyPopular)
  const [popularSnapshots, setPopularSnapshots] = useState<PopularSnapshotSummary[]>([])
  const [selectedPopularSnapshotId, setSelectedPopularSnapshotId] = useState<number | null>(null)
  const [isPopularLoading, setIsPopularLoading] = useState(false)
  const [popularError, setPopularError] = useState<string | null>(null)
  const selectedPopularSnapshotIdRef = useRef<number | null>(null)

  selectedPopularSnapshotIdRef.current = selectedPopularSnapshotId

  async function loadPopularSnapshots() {
    const signal = abort.createRequestSignal('popularSnapshots')
    try {
      const data = await newsApi.getPopularSnapshots(signal)
      if (!isMountedRef.current) return
      setPopularSnapshots(data.snapshots)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setPopularSnapshots([])
    } finally {
      abort.clearRequestSignal('popularSnapshots', signal)
    }
  }

  async function loadPopular(snapshotId = selectedPopularSnapshotIdRef.current, showActivity = false) {
    if (showActivity) setIsPopularLoading(true)
    const signal = abort.createRequestSignal('popular')
    try {
      const data = await newsApi.getPopular(snapshotId, signal)
      if (!isMountedRef.current) return
      setPopular(data)
      setSelectedPopularSnapshotId(data.snapshot?.id ?? null)
      setPopularError(null)
      void loadPopularSnapshots()
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setPopularError(error instanceof Error ? error.message : 'Unable to load Trending 100')
    } finally {
      abort.clearRequestSignal('popular', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsPopularLoading(false)
    }
  }

  return {
    popular,
    popularSnapshots,
    selectedPopularSnapshotId,
    setSelectedPopularSnapshotId,
    selectedPopularSnapshotIdRef,
    isPopularLoading,
    popularError,
    loadPopular,
    loadPopularSnapshots,
  }
}
