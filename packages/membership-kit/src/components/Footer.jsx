import { Link } from 'react-router-dom'
import { useSiteConfig } from '../config/SiteConfigContext'

export default function Footer() {
  const { footer, images } = useSiteConfig()

  return (
    <footer className="bg-foreground py-6 sm:py-8 px-3 sm:px-4 md:px-8 -mt-px">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-5 sm:pb-6 border-b border-primary-foreground/20">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <img src={images.botIcon} alt={footer.brandName} className="h-8 w-auto object-contain" />
            <div>
              <span className="block font-black text-white text-sm">{footer.brandName}</span>
              <span className="block text-[10px] text-primary-foreground/50 leading-none">{footer.brandSubtitle}</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {footer.navLinks.map((link) =>
              link.internal ? (
                <Link
                  key={link.label}
                  to={link.href}
                  className="text-primary-foreground/60 text-[11px] sm:text-xs font-semibold hover:text-primary-foreground/90 transition-colors"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-primary-foreground/60 text-[11px] sm:text-xs font-semibold hover:text-primary-foreground/90 transition-colors"
                >
                  {link.label}
                </a>
              )
            )}
          </nav>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 sm:pt-6 text-center sm:text-left">
          <p className="text-primary-foreground/40 text-[11px] sm:text-xs">
            &copy; {new Date().getFullYear()}{' '}
            <a href={footer.copyrightUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary-foreground/70 transition-colors">
              {footer.copyright}
            </a>
          </p>
          <p className="text-primary-foreground/40 text-[11px] sm:text-xs">
            {footer.poweredByLabel}{' '}
            <a href={footer.poweredByUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary-foreground/70 transition-colors">
              {footer.poweredByName}
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
