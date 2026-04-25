import { useSiteConfig } from '../config/SiteConfigContext'

export default function Features() {
  const { features } = useSiteConfig()

  return (
    <section id="features" className="bg-card py-10 sm:py-16 px-3 sm:px-4 md:px-8 -mt-px">
      <div className="max-w-4xl mx-auto">
        <h2 className="section-heading">{features.heading}</h2>
        <p className="section-sub">{features.subheading}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 mt-8 sm:mt-12">
          {features.items.map((f) => (
            <div key={f.title} className="card group">
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-muted flex items-center justify-center mb-4 text-xl sm:text-2xl">
                {f.icon}
              </div>
              <h3 className="font-black text-foreground text-base sm:text-lg mb-2 group-hover:text-primary transition-colors">
                {f.title}
              </h3>
              <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
