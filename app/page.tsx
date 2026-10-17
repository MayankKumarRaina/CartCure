import { BadgeIndianRupee, Scale, ShieldCheck } from 'lucide-react'
import { CartProvider } from '@/components/cart-provider'
import { SiteHeader } from '@/components/site-header'
import { MedicineSearch } from '@/components/medicine-search'
import { CartDrawer } from '@/components/cart-drawer'
import { BasketBar } from '@/components/basket-bar'

const HIGHLIGHTS = [
  { icon: Scale, label: '6 pharmacies compared' },
  { icon: BadgeIndianRupee, label: 'Membership break-even' },
  { icon: ShieldCheck, label: 'No sign-up needed' },
]

export default function Page() {
  return (
    <CartProvider>
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col px-4 pb-32">
        <section className="flex flex-col gap-3 pb-2 pt-8 md:pt-12" aria-labelledby="hero-heading">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            1mg · PharmEasy · Netmeds · Apollo · Truemeds · MedPlus
          </p>
          <h1
            id="hero-heading"
            className="text-balance text-[28px] font-semibold leading-[1.1] tracking-tight md:text-4xl"
          >
            Your monthly medicines, <span className="text-primary">at the lowest price.</span>
          </h1>
          <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
            Compare every pharmacy in one tap — then find out if a membership actually pays for itself
            on your refills.
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 text-primary" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </section>

        <MedicineSearch />
      </main>
      <BasketBar />
      <CartDrawer />
    </CartProvider>
  )
}