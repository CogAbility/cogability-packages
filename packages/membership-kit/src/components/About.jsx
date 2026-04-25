import { Link } from 'react-router-dom'
import { useSiteConfig } from '../config/SiteConfigContext'

export default function About() {
  const { about } = useSiteConfig()

  return (
    <section id="about" className="bg-card py-10 sm:py-16 px-3 sm:px-4 md:px-8 -mt-px">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="section-heading">{about.heading}</h2>

        {about.paragraphs.map((para, i) => (
          <p key={i} className="text-muted-foreground text-xs sm:text-base md:text-lg leading-relaxed mb-3 sm:mb-4 max-w-2xl mx-auto mt-4">
            {para}
          </p>
        ))}

        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-10">
          {about.checkItems.map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 bg-muted rounded-full px-4 py-2 text-xs sm:text-sm text-foreground font-semibold"
            >
              <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Link to="/members" className="btn-primary px-8 py-3.5 text-sm sm:text-base">
            {about.ctaLabel}
          </Link>
          <a
            href={about.secondaryCtaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full border-2 border-primary text-primary font-bold text-sm sm:text-base transition-all duration-200 hover:bg-primary hover:text-white"
          >
            {about.secondaryCtaLabel}
          </a>
        </div>

        <p className="text-muted-foreground text-[10px] sm:text-xs mt-8 sm:mt-10">
          {about.footerNote}{' '}
          <a
            href={about.footerLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-semibold"
          >
            {about.footerLinkLabel}
          </a>
        </p>
      </div>
    </section>
  )
}
