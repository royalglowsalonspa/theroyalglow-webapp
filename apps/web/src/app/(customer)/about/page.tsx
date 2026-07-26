/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : AboutPage
 * Scope        : Customer Pages
 *
 * Description  : About Us page showcasing the brand story, core values, and
 *                team members of Royal Glow Salon & Spa. Rebuilt on the
 *                shadcn/ui Card + Button + Badge primitives with motion Reveal
 *                entrances and lucide value icons.
 *
 * Responsibilities :
 * - Present the brand story and founding narrative
 * - Display core values (Premium Quality, Expert Team, Relaxing Ambiance)
 * - Render team member cards from CMS with fallback data
 *
 * Features / Functionality :
 * - Hero section with brand narrative
 * - Values grid with hover card effects
 * - Team section with CMS-driven or fallback team data
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                motion, lucide-react, JSON-LD
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, getTeamMembers, SEO helpers, @/components/ui/*,
 *                @/components/ui/motion/reveal, lucide-react, next/link
 *
 * Notes        :
 * - ISR with 1-hour revalidation for team member content from CMS
 ************************************************************/

import type { LucideIcon } from 'lucide-react'
import { Crown, Leaf, Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/seo/JsonLd'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/motion/reveal'
import { getTeamMembers } from '@/lib/cms/client'
import type { TeamMember } from '@/lib/cms/types'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = buildMetadata({
  title: 'About Us',
  description:
    'Learn about Royal Glow Salon & Spa — a premium beauty and wellness destination in Bengaluru, founded by Roshini with a passion for exceptional service.',
  path: '/about',
})

export const revalidate = 3600

const values: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Sparkles,
    title: 'Premium Quality',
    description:
      "We use only the finest products from trusted brands like L'Oréal, Schwarzkopf, and Olaplex to deliver results that exceed expectations.",
  },
  {
    icon: Crown,
    title: 'Expert Team',
    description:
      'Our stylists and therapists are trained professionals with years of experience in the latest techniques and trends.',
  },
  {
    icon: Leaf,
    title: 'Relaxing Ambiance',
    description:
      'Step into a space designed for calm and comfort — warm lighting, soothing music, and an atmosphere that lets you unwind completely.',
  },
]

const team: TeamMember[] = [
  {
    name: 'Roshini',
    role: 'Owner & Founder',
    bio: 'With a vision to bring premium beauty experiences to Bengaluru, Roshini founded Royal Glow to create a space where every client feels like royalty.',
    photo: null,
    specializations: [],
  },
  {
    name: 'Anjali',
    role: 'Senior Stylist',
    bio: 'Specialising in precision cuts and creative colouring, Anjali brings over 8 years of experience and a keen eye for detail to every appointment.',
    photo: null,
    specializations: [],
  },
  {
    name: 'Meera',
    role: 'Senior Therapist',
    bio: 'A certified spa therapist with expertise in aromatherapy and deep tissue techniques, Meera ensures every session leaves you feeling rejuvenated.',
    photo: null,
    specializations: [],
  },
]

export default async function AboutPage() {
  const cmsTeam = await getTeamMembers()
  const teamMembers = cmsTeam.length > 0 ? cmsTeam : team

  return (
    <div className="flex flex-col gap-20">
      <JsonLd
        data={[
          localBusinessJsonLd(),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'About' }]),
        ]}
      />

      {/* ── HERO ── */}
      <section aria-labelledby="about-hero-heading" className="px-5">
        <Reveal className="mx-auto mt-6 max-w-[1278px] lg:mt-10" as="div">
          <div className="rounded-[6px] bg-cocoa-dark p-8 sm:p-12 lg:p-16">
            <div className="mb-6 flex items-center gap-2">
              <span className="size-2 rounded-full bg-royal-gold" aria-hidden="true" />
              <span className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
                About Us
              </span>
            </div>
            <h1
              id="about-hero-heading"
              className="max-w-[600px] font-display font-black text-[clamp(40px,6vw,72px)] leading-[1.03] tracking-[-1.44px] text-canvas-white"
            >
              Our Story
            </h1>
            <p className="mt-6 max-w-[560px] font-sans text-[17px] leading-[1.6] text-dusty-gray">
              Royal Glow Salon & Spa was born from a simple belief — that everyone deserves to feel
              like royalty. Founded by Roshini in Bengaluru, we set out to create a premium beauty
              and wellness destination where expert care meets a truly relaxing experience. Every
              detail, from the products we use to the ambiance we craft, is designed to make your
              visit exceptional.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── VALUES ── */}
      <section aria-labelledby="values-heading" className="px-5">
        <div className="mx-auto max-w-[1278px]">
          <Reveal as="div">
            <h2
              id="values-heading"
              className="font-display font-black text-[clamp(32px,4.5vw,48px)] leading-[1.1] tracking-[-0.96px] text-cocoa-dark"
            >
              What We Stand For
            </h2>
          </Reveal>

          <RevealGroup className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {values.map((value) => (
              <RevealItem key={value.title}>
                <Card className="h-full gap-3 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-golden-mist hover:shadow-card-hover">
                  <span
                    className="flex size-11 items-center justify-center rounded-full bg-warm-cream text-deep-gold"
                    aria-hidden="true"
                  >
                    <value.icon className="size-5" />
                  </span>
                  <h3 className="mt-1 font-display text-lg text-cocoa-dark">{value.title}</h3>
                  <p className="font-sans text-[15px] leading-[1.55] text-warm-gray">
                    {value.description}
                  </p>
                </Card>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section aria-labelledby="team-heading" className="px-5">
        <div className="mx-auto max-w-[1278px]">
          <Reveal as="div">
            <h2
              id="team-heading"
              className="font-display font-black text-[clamp(32px,4.5vw,48px)] leading-[1.1] tracking-[-0.96px] text-cocoa-dark"
            >
              Meet Our Team
            </h2>
            <p className="mt-3 max-w-[520px] font-sans text-[17px] leading-[1.6] text-warm-gray">
              The talented professionals behind every transformation at Royal Glow.
            </p>
          </Reveal>

          <RevealGroup className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {teamMembers.map((member) => (
              <RevealItem key={member.name}>
                <Card className="h-full gap-3 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-golden-mist hover:shadow-card-hover">
                  {member.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.photo.url}
                      alt={member.photo.alt}
                      className="size-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-full bg-warm-cream">
                      <span className="font-display text-xl text-cocoa-dark">
                        {member.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <h3 className="mt-1 font-display text-lg text-cocoa-dark">{member.name}</h3>
                  <p className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold">
                    {member.role}
                  </p>
                  {member.specializations.length > 0 && (
                    <ul
                      className="flex flex-wrap gap-2"
                      aria-label={`${member.name} specializations`}
                    >
                      {member.specializations.map((spec) => (
                        <li key={spec}>
                          <Badge
                            variant="secondary"
                            className="bg-warm-cream font-ui text-[10px] uppercase tracking-[0.08em] text-warm-gray"
                          >
                            {spec}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="font-sans text-[15px] leading-[1.55] text-warm-gray">
                    {member.bio}
                  </p>
                </Card>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── CTA ── */}
      <section aria-labelledby="about-cta-heading" className="px-5 pb-20">
        <Reveal className="mx-auto max-w-[1278px]" as="div">
          <div className="rounded-[6px] bg-warm-cream p-8 text-center sm:p-12 lg:p-16">
            <h2
              id="about-cta-heading"
              className="font-display font-black text-[clamp(32px,4.5vw,48px)] leading-[1.1] tracking-[-0.96px] text-cocoa-dark"
            >
              Experience the Royal Glow difference
            </h2>
            <p className="mx-auto mt-4 max-w-[440px] font-sans text-[17px] leading-[1.6] text-warm-gray">
              Visit us and discover why our clients keep coming back for the royal treatment.
            </p>
            <Button
              asChild
              variant="gold"
              size="lg"
              className="mt-8 rounded-full font-ui font-bold"
            >
              <Link href="/?book=1" aria-label="Book an appointment at Royal Glow">
                Book Now
              </Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
