import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-cocoa-dark text-canvas-white">
      <div className="mx-auto max-w-[1278px] px-5 py-12 lg:py-16">
        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 lg:gap-16">
          {/* Column 1: Logo + NAP */}
          <div>
            <Link href="/" className="font-display text-2xl text-canvas-white tracking-tight">
              Royal Glow
            </Link>
            <address className="not-italic mt-4 space-y-2 font-sans text-[15px] leading-[1.55] text-dusty-gray">
              <p>1st Floor, Narmada Complex, 48/3,</p>
              <p>Rayasandra Main Rd, Above SBI Bank,</p>
              <p>Naganathapura, Parappana Agrahara,</p>
              <p>Bengaluru, Karnataka 560100, India</p>
              <p className="pt-2">
                <a
                  href="tel:+916360135720"
                  className="text-canvas-white hover:text-royal-gold transition-colors duration-200"
                >
                  +91 63601 35720
                </a>
              </p>
              <p>
                <a
                  href="mailto:hello@theroyalglow.in"
                  className="text-canvas-white hover:text-royal-gold transition-colors duration-200"
                >
                  hello@theroyalglow.in
                </a>
              </p>
            </address>
          </div>

          {/* Column 2: Hours + Social */}
          <div>
            <h3 className="font-ui text-xs uppercase tracking-[0.5px] text-warm-stone mb-4">
              Opening Hours
            </h3>
            <div className="font-sans text-[15px] leading-[1.55] text-dusty-gray space-y-1">
              <p>
                <span className="text-canvas-white">Mon – Fri:</span> 10:00 – 21:00
              </p>
              <p>
                <span className="text-canvas-white">Sat – Sun:</span> 10:00 – 22:00
              </p>
            </div>

            <h3 className="font-ui text-xs uppercase tracking-[0.5px] text-warm-stone mt-8 mb-4">
              Follow Us
            </h3>
            <div className="flex items-center gap-4">
              <a
                href="https://instagram.com/theroyalglow"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow us on Instagram"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/25 text-canvas-white hover:bg-white/10 transition-colors duration-200"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              <a
                href="https://facebook.com/theroyalglow"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow us on Facebook"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/25 text-canvas-white hover:bg-white/10 transition-colors duration-200"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a
                href="https://youtube.com/@theroyalglow"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Watch us on YouTube"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/25 text-canvas-white hover:bg-white/10 transition-colors duration-200"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
              <a
                href="https://maps.google.com/?cid=YOUR_PLACE_ID"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Find us on Google Maps"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/25 text-canvas-white hover:bg-white/10 transition-colors duration-200"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 0C7.802 0 4 3.403 4 7.602 4 11.8 7.469 16.812 12 24c4.531-7.188 8-12.2 8-16.398C20 3.403 16.199 0 12 0zm0 11a3 3 0 110-6 3 3 0 010 6z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Column 3: Legal + Cookie Preferences */}
          <div>
            <h3 className="font-ui text-xs uppercase tracking-[0.5px] text-warm-stone mb-4">
              Legal
            </h3>
            <nav aria-label="Legal links" className="flex flex-col gap-2">
              <Link
                href="/privacy"
                className="font-sans text-[15px] text-dusty-gray hover:text-canvas-white transition-colors duration-200"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="font-sans text-[15px] text-dusty-gray hover:text-canvas-white transition-colors duration-200"
              >
                Terms of Service
              </Link>
              <Link
                href="/refund-policy"
                className="font-sans text-[15px] text-dusty-gray hover:text-canvas-white transition-colors duration-200"
              >
                Refund Policy
              </Link>
            </nav>

            <button
              type="button"
              className="mt-6 font-sans text-[15px] text-dusty-gray hover:text-canvas-white transition-colors duration-200"
              aria-label="Manage cookie preferences"
            >
              🍪 Cookie Preferences
            </button>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-white/10 text-center">
          <p className="font-sans text-sm text-dusty-gray">
            © 2026 Royal Glow Salon & Spa. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
