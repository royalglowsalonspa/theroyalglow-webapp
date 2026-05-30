import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Us | Royal Glow Salon & Spa',
  description:
    'Learn about Royal Glow Salon & Spa — a premium beauty and wellness destination in Bengaluru, founded by Roshini with a passion for exceptional service.',
  openGraph: {
    title: 'About Us | Royal Glow Salon & Spa',
    description:
      'Learn about Royal Glow Salon & Spa — a premium beauty and wellness destination in Bengaluru.',
    url: 'https://theroyalglow.in/about',
    siteName: 'Royal Glow Salon & Spa',
    locale: 'en_IN',
    type: 'website',
  },
}

const values = [
  {
    icon: '✨',
    title: 'Premium Quality',
    description:
      'We use only the finest products from trusted brands like L\'Oréal, Schwarzkopf, and Olaplex to deliver results that exceed expectations.',
  },
  {
    icon: '👑',
    title: 'Expert Team',
    description:
      'Our stylists and therapists are trained professionals with years of experience in the latest techniques and trends.',
  },
  {
    icon: '🌿',
    title: 'Relaxing Ambiance',
    description:
      'Step into a space designed for calm and comfort — warm lighting, soothing music, and an atmosphere that lets you unwind completely.',
  },
]

const team = [
  {
    name: 'Roshini',
    role: 'Owner & Founder',
    bio: 'With a vision to bring premium beauty experiences to Bengaluru, Roshini founded Royal Glow to create a space where every client feels like royalty.',
  },
  {
    name: 'Anjali',
    role: 'Senior Stylist',
    bio: 'Specialising in precision cuts and creative colouring, Anjali brings over 8 years of experience and a keen eye for detail to every appointment.',
  },
  {
    name: 'Meera',
    role: 'Senior Therapist',
    bio: 'A certified spa therapist with expertise in aromatherapy and deep tissue techniques, Meera ensures every session leaves you feeling rejuvenated.',
  },
]

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-20">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* HERO SECTION */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section aria-labelledby="about-hero-heading" className="px-5">
        <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
          <div className="bg-cocoa-dark rounded-[6px] p-8 sm:p-12 lg:p-16">
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-royal-gold" aria-hidden="true" />
              <span className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
                About Us
              </span>
            </div>

            {/* Headline */}
            <h1
              id="about-hero-heading"
              className="font-display text-canvas-white tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)] max-w-[600px]"
            >
              Our Story
            </h1>

            {/* Description */}
            <p className="font-sans text-[17px] leading-[1.6] text-dusty-gray mt-6 max-w-[560px]">
              Royal Glow Salon & Spa was born from a simple belief — that everyone deserves to feel like royalty. Founded by Roshini in Bengaluru, we set out to create a premium beauty and wellness destination where expert care meets a truly relaxing experience. Every detail, from the products we use to the ambiance we craft, is designed to make your visit exceptional.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* VALUES SECTION */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section aria-labelledby="values-heading" className="px-5">
        <div className="mx-auto max-w-[1278px]">
          <h2
            id="values-heading"
            className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
          >
            What We Stand For
          </h2>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((value) => (
              <article
                key={value.title}
                className="bg-canvas-white border border-cloud-gray rounded-[6px] p-6 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover"
              >
                <span className="text-3xl" aria-hidden="true">
                  {value.icon}
                </span>
                <h3 className="font-display text-cocoa-dark text-lg mt-3">
                  {value.title}
                </h3>
                <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-2">
                  {value.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TEAM SECTION */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section aria-labelledby="team-heading" className="px-5">
        <div className="mx-auto max-w-[1278px]">
          <h2
            id="team-heading"
            className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
          >
            Meet Our Team
          </h2>
          <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-3 max-w-[520px]">
            The talented professionals behind every transformation at Royal Glow.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {team.map((member) => (
              <article
                key={member.name}
                className="bg-canvas-white border border-cloud-gray rounded-[6px] p-6 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover"
              >
                {/* Avatar placeholder */}
                <div className="w-16 h-16 rounded-full bg-warm-cream flex items-center justify-center">
                  <span className="font-display text-xl text-cocoa-dark">
                    {member.name.charAt(0)}
                  </span>
                </div>
                <h3 className="font-display text-cocoa-dark text-lg mt-4">
                  {member.name}
                </h3>
                <p className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mt-1">
                  {member.role}
                </p>
                <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-3">
                  {member.bio}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* CTA SECTION */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section aria-labelledby="about-cta-heading" className="px-5 pb-20">
        <div className="mx-auto max-w-[1278px]">
          <div className="bg-warm-cream rounded-[6px] p-8 sm:p-12 lg:p-16 text-center">
            <h2
              id="about-cta-heading"
              className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
            >
              Experience the Royal Glow difference
            </h2>
            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-4 max-w-[440px] mx-auto">
              Visit us and discover why our clients keep coming back for the royal treatment.
            </p>
            <Link
              href="/?book=1"
              className="mt-8 inline-flex bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
              aria-label="Book an appointment at Royal Glow"
            >
              Book Now
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
