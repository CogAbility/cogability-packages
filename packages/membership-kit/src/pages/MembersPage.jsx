import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useSiteConfig } from '../config/SiteConfigContext'
import CogBotEmbed from '../components/CogBotEmbed'

export default function MembersPage() {
  const { members } = useSiteConfig()
  const { user, logout, hasProfile } = useAuth()
  const navigate = useNavigate()

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'Member'

  useEffect(() => {
    if (user?.uid && !hasProfile && !localStorage.getItem(`onboarded_${user.uid}`)) {
      navigate('/onboarding', { replace: true });
    }
  }, [user?.uid, hasProfile, navigate])

  return (
    <main className="min-h-[calc(100vh-64px)] bg-background">
      <div className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div>
            <h1 className="font-black text-foreground text-base sm:text-lg">
              {members.greetingTemplate.replace('{firstName}', firstName)}
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs mt-0.5">
              {user?.email} &bull; {members.memberBadge}
            </p>
          </div>
          <button
            onClick={logout}
            className="text-xs sm:text-sm text-muted-foreground hover:text-destructive transition-colors font-semibold flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {members.signOutLabel}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-lg sm:text-xl font-black text-foreground">{members.chatHeading}</h2>
              <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                {members.chatSubheading}
              </p>
            </div>
            <CogBotEmbed height="640px" />
          </div>

          <div className="space-y-4">
            <div className="card">
              <h3 className="font-black text-foreground mb-3 text-sm">{members.quickTipsHeading}</h3>
              <ul className="space-y-2">
                {members.quickTips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-[11px] sm:text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5 flex-shrink-0">{members.tipBullet}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="animated-gradient-hero rounded-2xl p-5 sm:p-6">
              <div className="text-2xl mb-2">{members.memberEmoji}</div>
              <h3 className="font-black text-white mb-1 text-sm">{members.memberBadge}</h3>
              <p className="text-primary-foreground/80 text-[11px] sm:text-xs leading-relaxed">
                {members.memberDescription}
              </p>
            </div>

            <div className="card">
              <h3 className="font-black text-foreground mb-2 text-sm">{members.aboutBotHeading}</h3>
              <p className="text-muted-foreground text-[11px] sm:text-xs leading-relaxed">
                {members.aboutBotDescription}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
