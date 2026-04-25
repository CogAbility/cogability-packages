import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useSiteConfig } from '../config/SiteConfigContext'

export default function Header() {
  const { header } = useSiteConfig()
  const { user, isAuthenticated, isMember, isLoading, geofenced, login, logout } = useAuth()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogin = () => login('/members')

  const handleUserIconClick = () => {
    if (isAuthenticated) {
      setDropdownOpen((o) => !o)
    } else {
      handleLogin()
    }
  }

  return (
    <header className="absolute top-0 left-0 right-0 z-50 bg-primary">
      <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-2.5 sm:py-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-2">
          <span className="w-5 h-5 sm:w-6 sm:h-6 bg-secondary rounded flex items-center justify-center text-white font-black text-[10px] sm:text-xs flex-shrink-0">
            {header.projectBadgeInitial}
          </span>
          <span className="text-foreground font-bold text-[11px] sm:text-sm whitespace-nowrap">
            {header.projectBadge}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!isAuthenticated && !isLoading && !geofenced && (
            <button
              onClick={handleLogin}
              className="flex items-center gap-1.5 bg-white text-primary font-bold text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {header.signInLabel}
            </button>
          )}

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={handleUserIconClick}
              disabled={isLoading}
              aria-label={isAuthenticated ? header.accountMenuAriaLabel : header.signInAriaLabel}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-foreground/70 backdrop-blur-sm border border-primary-foreground/30 flex items-center justify-center text-primary-foreground hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </button>

            {dropdownOpen && isAuthenticated && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-card rounded-xl shadow-xl border border-border overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-bold text-foreground truncate">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <div className="px-2 py-2">
                  {isMember ? (
                    <div className="px-3 py-1.5 rounded-lg bg-primary/10 mb-2">
                      <p className="text-xs font-bold text-primary">{header.memberBadgeLabel}</p>
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 rounded-lg bg-muted mb-2">
                      <p className="text-xs text-muted-foreground">{header.signedInLabel}</p>
                    </div>
                  )}
                  {isMember && (
                    <Link
                      to="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {header.editProfileLabel}
                    </Link>
                  )}
                  <button
                    onClick={() => { logout(); setDropdownOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {header.signOutLabel}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
