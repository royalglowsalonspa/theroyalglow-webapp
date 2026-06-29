import * as React from 'react'

// Royal Glow admin: rail↔drawer breakpoint is the canonical shadcn 768px
// (Tailwind `md`). This MUST match the `md:` visibility classes in the Sidebar
// primitive's desktop branch — otherwise, between 768px and the breakpoint the
// hook reports "mobile" (rendering the Sheet overlay) while the markup expects
// the persistent rail, so the sidebar overlays the page content.
const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
