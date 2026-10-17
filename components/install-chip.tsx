'use client'

import { useEffect, useState } from 'react'
import { MonitorSmartphone, Share, SquarePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallChip() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferred(null)
    } else {
      setHelpOpen(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/20 bg-primary-soft px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 md:hidden"
      >
        <SquarePlus className="size-3.5" aria-hidden="true" />
        Add to Home Screen
      </button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Install CartCure</DialogTitle>
            <DialogDescription>
              Get one-tap access to price comparisons, right from your home screen.
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <Share className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5 text-muted-foreground">
                On iPhone, tap <span className="font-medium text-foreground">Share</span> in Safari.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <SquarePlus className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5 text-muted-foreground">
                Choose <span className="font-medium text-foreground">Add to Home Screen</span>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <MonitorSmartphone className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5 text-muted-foreground">
                On Android Chrome, open the menu and tap{' '}
                <span className="font-medium text-foreground">Install app</span>.
              </span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
