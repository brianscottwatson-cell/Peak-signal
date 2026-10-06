# Feature map

Each `##` heading is one public route. The heading is the route only, so `scripts/check-feature-map.mjs` can parse it.

These routes come from `static-site/*.html`, `seo/landers/*.html`, the Express routers, and `vercel.json`. Vercel rewrites each route to the source file below. `/contact.html` and the other `.html` aliases are the same pages, not extra sections.

`/sitemap.xml` and `/robots.txt` are not HTML pages. The Google Search Console verification file is served by the routers and is not a page, so it is not listed. Ops pages are not public marketing routes.

Nav links are the anchors in the header `<nav>` (or the lander header nav). CTAs are the button-style actions. A control that is both is listed in both places.

## /

- Route: /
- Source file: static-site/index.html
- Purpose: Homepage for the operating system, with an assessment invitation.
- H1: Put AI to work on the tools you already have.
- Key sections:
  - One system. Every customer, every call, every follow-up — connected.
  - Three jobs. One system.
  - We built it for our own business first.
  - Results
  - A ladder, not a menu.
  - See what it does for your business.
- CTAs:
  - Book an assessment → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
  - See the offers → #offers
  - Book your assessment → /contact
- In-page links:
  - Evergreen → /ai-websites-evergreen-co
- Forms: none
- JSON-LD @types: none
- Nav links:
  - The System → #system
  - Offers → #offers
  - How it Works → #how
  - Contact → /contact
  - Book an assessment → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Book an assessment → /contact
  - Contact → /contact

## /contact

- Route: /contact
- Source file: static-site/contact.html
- Purpose: Assessment request, by a booked call or the contact form.
- H1: Book your assessment
- Key sections:
  - Booking call
  - Assessment form
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
  - Book a 30-min call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - Privacy Policy → /privacy
  - Terms → /terms
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
- Forms: https://formspree.io/f/mgobgrlr
  - Method: POST
  - Submit: Request my assessment
- JSON-LD @types: none
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - How it Works → /#how
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Privacy → /privacy
  - Terms → /terms

## /privacy

- Route: /privacy
- Source file: static-site/privacy.html
- Purpose: Privacy policy for the site and the text program.
- H1: Privacy Policy
- Key sections:
  - What I collect
  - How I use it
  - Text messages (SMS)
  - Who else sees this
  - How long I keep it
  - How to reach me
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - contact form → /contact.html
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - https://peak-signal.vercel.app/contact.html → /contact.html
- Forms: none
- JSON-LD @types: none
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - How it Works → /#how
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Privacy → /privacy
  - Terms → /terms
  - Contact → /contact

## /terms

- Route: /terms
- Source file: static-site/terms.html
- Purpose: Terms for the site and the text program.
- H1: Terms
- Key sections:
  - The Peak Signal text program
  - The website and the work
  - Using the site
  - How to reach me
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - Privacy Policy → /privacy.html
  - peak-signal.vercel.app → https://peak-signal.vercel.app
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - https://peak-signal.vercel.app/contact.html → /contact.html
- Forms: none
- JSON-LD @types: none
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - How it Works → /#how
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Privacy → /privacy
  - Terms → /terms
  - Contact → /contact

## /ai-websites-evergreen-co

- Route: /ai-websites-evergreen-co
- Source file: seo/landers/ai-websites-evergreen-co.html
- Purpose: Landing page for a local website build in Evergreen.
- H1: Get Found by More Evergreen, CO Customers
- Key sections:
  - Who this is for
  - What you get (Capture)
  - Works with the tools you already use
  - How it works with the rest of Peak Signal
  - Evergreen & foothills
  - FAQ
- CTAs:
  - Book a site review → /contact
  - Contact Peak Signal → /contact
- In-page links:
  - Peak Signal → /
  - Capture → /ai-websites-evergreen-co
  - Answer → /ai-agents-small-business-evergreen
  - Keep → /ai-automation-evergreen-colorado
  - contact → /contact
  - Capture Evergreen → /ai-websites-evergreen-co
  - AI automation Evergreen → /ai-automation-evergreen-colorado
  - AI agents Evergreen → /ai-agents-small-business-evergreen
- Forms: none
- JSON-LD @types: ProfessionalService, Person
- Nav links:
  - Capture → /ai-websites-evergreen-co
  - Keep → /ai-automation-evergreen-colorado
  - Answer → /ai-agents-small-business-evergreen
  - Contact → /contact
- Footer links:
  - getpeaksignal.com → /

## /ai-automation-evergreen-colorado

- Route: /ai-automation-evergreen-colorado
- Source file: seo/landers/ai-automation-evergreen-colorado.html
- Purpose: Landing page for follow-up automation in Evergreen.
- H1: AI Automation for Evergreen, Colorado Small Businesses
- Key sections:
  - The pain
  - What we automate (Keep)
  - Where the website & phone fit
  - Simple stack story
  - Example flows
  - FAQ
- CTAs:
  - Map your first automation → /contact
  - Contact Peak Signal → /contact
- In-page links:
  - Peak Signal → /
  - Keep → /ai-automation-evergreen-colorado
  - Capture → /ai-websites-evergreen-co
  - Answer → /ai-agents-small-business-evergreen
  - Capture Evergreen → /ai-websites-evergreen-co
  - AI automation Evergreen → /ai-automation-evergreen-colorado
  - AI agents Evergreen → /ai-agents-small-business-evergreen
- Forms: none
- JSON-LD @types: ProfessionalService, Person
- Nav links:
  - Capture → /ai-websites-evergreen-co
  - Keep → /ai-automation-evergreen-colorado
  - Answer → /ai-agents-small-business-evergreen
  - Contact → /contact
- Footer links:
  - getpeaksignal.com → /

## /ai-agents-small-business-evergreen

- Route: /ai-agents-small-business-evergreen
- Source file: seo/landers/ai-agents-small-business-evergreen.html
- Purpose: Landing page for phone and text coverage in Evergreen.
- H1: AI Agents for Small Businesses in Evergreen
- Key sections:
  - What an AI agent does (plain English)
  - Answer
  - Not a replacement for your team
  - Tied to the website
  - Fit for local verticals
  - FAQ
- CTAs:
  - See how Answer works → /contact
  - Contact Peak Signal → /contact
- In-page links:
  - Peak Signal → /
  - Answer → /ai-agents-small-business-evergreen
  - Capture → /ai-websites-evergreen-co
  - Keep → /ai-automation-evergreen-colorado
  - Capture Evergreen → /ai-websites-evergreen-co
  - AI automation Evergreen → /ai-automation-evergreen-colorado
  - AI agents Evergreen → /ai-agents-small-business-evergreen
- Forms: none
- JSON-LD @types: ProfessionalService, Person
- Nav links:
  - Capture → /ai-websites-evergreen-co
  - Keep → /ai-automation-evergreen-colorado
  - Answer → /ai-agents-small-business-evergreen
  - Contact → /contact
- Footer links:
  - getpeaksignal.com → /

## /sitemap.xml

- Route: /sitemap.xml
- Source file: seo/sitemap.xml
- Purpose: Crawler list of the public HTML URLs.
- H1: none
- Key sections: none
- CTAs: none
- Forms: none
- JSON-LD @types: none
- Nav links: none
- Footer links: none

## /robots.txt

- Route: /robots.txt
- Source file: static-site/robots.txt
- Also served from: seo/robots.txt
- Purpose: Crawler rules and the sitemap location.
- H1: none
- Key sections: none
- CTAs: none
- Forms: none
- JSON-LD @types: none
- Nav links: none
- Footer links: none
