import { Link } from 'react-router-dom'
import { useSiteConfig } from '../config/SiteConfigContext'

export default function Testimonials() {
  const { testimonials } = useSiteConfig()

  return (
    <section id="testimonials" className="bg-foreground py-6 sm:py-8 px-3 sm:px-4 md:px-8 -mt-px">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-primary-foreground text-center">
          {testimonials.heading}
        </h2>
        <p className="text-primary-foreground/70 text-xs sm:text-base text-center max-w-xl mx-auto mt-3 mb-8 sm:mb-12">
          {testimonials.subheading}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
          {testimonials.items.map((t) => (
            <div
              key={t.name}
              className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-2xl p-5 sm:p-6 flex flex-col"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <blockquote className="text-primary-foreground/90 text-xs sm:text-sm leading-relaxed flex-1 italic">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-primary-foreground/20">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/60 border border-primary-foreground/20 flex items-center justify-center font-bold text-xs sm:text-sm text-white flex-shrink-0">
                  {t.initials}
                </div>
                <div>
                  <div className="font-bold text-primary-foreground text-xs sm:text-sm">{t.name}</div>
                  <div className="text-primary-foreground/60 text-[10px] sm:text-xs">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 pt-8 sm:pt-10 pb-2 sm:pb-4 px-4">
          <Link
            to="/members"
            className="inline-flex items-center justify-center px-7 py-3 rounded-full bg-white text-primary font-black text-sm transition-all duration-200 hover:bg-white/90 hover:shadow-xl"
          >
            {testimonials.ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  )
}
