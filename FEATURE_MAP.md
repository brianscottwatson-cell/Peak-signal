# Feature map

Each `##` heading is one public route. The heading is the route only, so `scripts/check-feature-map.mjs` can parse it.

These routes come from `static-site/*.html`, `static-site/guides/*.html` (served at `/guides/<slug>`), `seo/landers/*.html`, the Express routers, and `vercel.json`. Vercel rewrites each route to the source file below. `/contact.html` and the other `.html` aliases are the same pages, not extra sections.

`/sitemap.xml` and `/robots.txt` are not HTML pages. The Google Search Console verification file is served by the routers and is not a page, so it is not listed. Ops pages are not public marketing routes.

Nav links are the anchors in the header `<nav>` (or the lander header nav). CTAs are the button-style actions. A control that is both is listed in both places.

`scripts/check-seo.mjs` checks the HTML pages in this map, except `/sitemap.xml` and `/robots.txt`. It runs in the guardrail workflow. After HTML entities and whitespace are normalized, `<title>` must equal `<h1 text> | Peak Signal`. A page that needs a different title is listed, with a comment, in `scripts/seo.config.json`. The homepage, about, contact, privacy, and terms titles are on that list. Each page also needs one `<h1>`, a meta description, a canonical link, and `og:title` and `twitter:title` equal to `<title>`. Every URL in `seo/sitemap.xml` must map to a file in the repo.

## /

- Route: /
- Source file: static-site/index.html
- Purpose: Homepage for AI-first modernization, with the Foundation, Solutions, Colorado Hot Tub case study, FAQ, and a booked call.
- H1: Modernize your business.
- Key sections:
  - Foundation
  - Solutions
  - Case study
  - Frequently Asked Questions
  - Book a call
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - coloradohottubllc.com → https://coloradohottubllc.com/
  - AI Deployments → /ai-deployments
  - privacy policy → /privacy
- Forms: none
- JSON-LD @types: ProfessionalService, Person, FAQPage
- Nav links:
  - Peak Signal → /
  - The System → #system
  - Offers → #offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → #how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Evergreen → /ai-websites-evergreen-co
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
  - Privacy → /privacy
  - Terms → /terms

## /contact

- Route: /contact
- Source file: static-site/contact.html
- Purpose: General inquiry and assessment request, by a booked call or the contact form. Telecom quote requests are sent to the form on /telecom (link under the phone number). No telecom quote fields here.
- H1: Book a call
- Key sections:
  - Booking call
  - Assessment form
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
  - Book a 30-min call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - 970-660-5088 → tel:+19706605088
  - telecom quote form → /telecom#quote
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
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Telecom → /telecom
  - About → /about
  - Privacy → /privacy
  - Terms → /terms

## /about

- Route: /about
- Source file: static-site/about.html
- Purpose: About Peak Signal, the studio in Evergreen, Colorado.
- H1: About Peak Signal
- Key sections: none
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - See the Colorado Hot Tub case study → /#case-study
- Forms: none
- JSON-LD @types: ProfessionalService, Person
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Evergreen → /ai-websites-evergreen-co
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
  - Privacy → /privacy
  - Terms → /terms

## /ai-deployments

- Route: /ai-deployments
- Source file: static-site/ai-deployments.html
- Purpose: AI implementation engagement. A free scoping call, a paid deep-dive assessment, then an embedded forward deployed engineer who sets up an AI operating system for a US company.
- H1: AI Deployments
- Key sections:
  - What it is
  - What the AI operating system is
  - How an engagement runs
  - What your team keeps
  - Who it's for
  - Proof
  - Who does the work
  - FAQ
  - Start with a free scoping call
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
  - Book a 30-minute call → https://calendly.com/hello-peaksignal/30min
  - Request an assessment → /contact
- In-page links:
  - See the case study → /#case-study
  - privacy policy → /privacy
- Forms: none
- JSON-LD @types: Service, FAQPage
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
  - Privacy → /privacy
  - Terms → /terms

## /telecom

- Route: /telecom
- Source file: static-site/telecom.html
- Purpose: Catalog of business phone, UCaaS, and connectivity vendors, with the telecom quote form on the page (#quote). Business services only. Every "Request a quote" control (hero, vendor cards) scrolls to that form, with every flag value; vendor cards prefill the vendor. The form posts to POST /api/telecom/quote-request. With PEAK_TELECOM_INTAKE_ENABLED=1 the request is queued, gets a loc8 draft when the partner env is set, and Peak gets the intake notice. With the intake flag off the same validation runs and Peak gets one notice; nothing is queued and no draft is built. If that API cannot be reached, the page sends the fields to the contact-form Formspree inbox instead. The visitor sees the same success message either way. /telecom/quote 301s to /telecom#quote and keeps the query. With PEAK_TELECOM_CHAT=1 the in-page chat also mounts, above the form; the form stays. The two flags are independent and default off. No customer quote email is sent. The form has no action attribute (it posts with fetch), so Forms below reads none.
- H1: Telecom & Connectivity
- Key sections:
  - How this catalog works
  - Telecom catalog
  - More vendors
  - Want a quote or information? (the quote form)
  - Quote and opportunity chat (off unless PEAK_TELECOM_CHAT=1)
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
  - Request a quote → /telecom#quote
  - Call 970-660-5088 → tel:+19706605088
- In-page links:
  - Request a quote → /telecom#quote
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
- Forms: none
- JSON-LD @types: Service, Organization, ContactPoint, Country, OpeningHoursSpecification, OfferCatalog, Offer, CommunicateAction, EntryPoint
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
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
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Telecom → /telecom
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
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - Telecom → /telecom
  - Privacy → /privacy
  - Terms → /terms
  - Contact → /contact

## /ai-websites-evergreen-co

- Route: /ai-websites-evergreen-co
- Source file: seo/landers/ai-websites-evergreen-co.html
- Purpose: Landing page for a local website build in Evergreen.
- H1: Website & SEO in Evergreen, CO
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
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - Contact → /contact
- Footer links:
  - getpeaksignal.com → /
  - Telecom → /telecom

## /ai-automation-evergreen-colorado

- Route: /ai-automation-evergreen-colorado
- Source file: seo/landers/ai-automation-evergreen-colorado.html
- Purpose: Landing page for follow-up automation in Evergreen.
- H1: AI Harness & Integrations in Evergreen, CO
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
  - AI Deployments → /ai-deployments
- Forms: none
- JSON-LD @types: ProfessionalService, Person
- Nav links:
  - Capture → /ai-websites-evergreen-co
  - Keep → /ai-automation-evergreen-colorado
  - Answer → /ai-agents-small-business-evergreen
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - Contact → /contact
- Footer links:
  - getpeaksignal.com → /
  - Telecom → /telecom

## /ai-agents-small-business-evergreen

- Route: /ai-agents-small-business-evergreen
- Source file: seo/landers/ai-agents-small-business-evergreen.html
- Purpose: Landing page for phone and text coverage in Evergreen.
- H1: Voice & Email Agents in Evergreen
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
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - Contact → /contact
- Footer links:
  - getpeaksignal.com → /
  - Telecom → /telecom

## /guides/rural-mountain-business-internet-colorado

- Route: /guides/rural-mountain-business-internet-colorado
- Source file: static-site/guides/rural-mountain-business-internet-colorado.html
- Purpose: Buyer guide to business internet for rural and mountain Colorado: fiber, cable, DSL, fixed wireless, 5G/LTE, and satellite, what to check at an address, and a telecom quote. Not linked from other pages; listed in the sitemap and llms files.
- H1: Business internet options for rural and mountain Colorado
- Key sections:
  - The options, from most to least wired
  - What to check at your address
  - How Peak Signal helps
  - FAQ
  - Get a quote
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - Request a telecom quote → /telecom
  - book a call → /contact
- Forms: none
- JSON-LD @types: Article, FAQPage
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
  - Privacy → /privacy
  - Terms → /terms

## /guides/ucaas-vs-traditional-business-phone-line

- Route: /guides/ucaas-vs-traditional-business-phone-line
- Source file: static-site/guides/ucaas-vs-traditional-business-phone-line.html
- Purpose: Buyer guide comparing UCaaS with a traditional (POTS) business line, with questions to ask before switching and a telecom quote. Not linked from other pages; listed in the sitemap and llms files.
- H1: UCaaS vs. a traditional business phone line
- Key sections:
  - Side by side
  - What to ask before you switch
  - Where Peak Signal fits
  - FAQ
  - Compare options for your business
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - Request a telecom quote → /telecom
  - book a call → /contact
- Forms: none
- JSON-LD @types: Article, FAQPage
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
  - Privacy → /privacy
  - Terms → /terms

## /guides/how-a-telecom-agent-gets-paid

- Route: /guides/how-a-telecom-agent-gets-paid
- Source file: static-site/guides/how-a-telecom-agent-gets-paid.html
- Purpose: Buyer guide to how telecom agents are typically paid, questions to ask any agent, and how Peak Signal handles telecom requests. Not linked from other pages; listed in the sitemap and llms files.
- H1: How does a telecom agent get paid?
- Key sections:
  - How the common model works
  - Questions to ask any telecom agent
  - How Peak Signal handles telecom requests
  - FAQ
  - Get a quote
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - Request a telecom quote → /telecom
  - book a call → /contact
- Forms: none
- JSON-LD @types: Article, FAQPage
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
  - Privacy → /privacy
  - Terms → /terms

## /guides/what-an-ai-deployment-looks-like

- Route: /guides/what-an-ai-deployment-looks-like
- Source file: static-site/guides/what-an-ai-deployment-looks-like.html
- Purpose: Buyer guide to an AI deployment for a small or mid-size business: scoping call, assessment, deployment, what gets set up, and what stays the same. Not linked from other pages; listed in the sitemap and llms files.
- H1: What does an AI deployment look like for a small or mid-size business?
- Key sections:
  - The three steps
  - What gets set up (every client's mix is different)
  - What stays the same
  - FAQ
  - Start with a free scoping call
- CTAs:
  - Book a call → https://calendly.com/hello-peaksignal/30min
- In-page links:
  - Book a call → /contact
- Forms: none
- JSON-LD @types: Article, FAQPage
- Nav links:
  - Peak Signal → /
  - The System → /#system
  - Offers → /#offers
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - How it Works → /#how
  - About → /about
  - Contact → /contact
  - Book a call → https://calendly.com/hello-peaksignal/30min
- Footer links:
  - 970-660-5088 → tel:+19706605088
  - hello.peaksignal@gmail.com → mailto:hello.peaksignal@gmail.com
  - AI Deployments → /ai-deployments
  - Telecom → /telecom
  - About → /about
  - Contact → /contact
  - Privacy → /privacy
  - Terms → /terms

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
