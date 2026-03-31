import { useState, useEffect } from 'react'
import api from '../services/api'
import PageHeader from '../components/PageHeader'

// ── Static resource library ──────────────────────────────────────────────────
// AI ranks these — never invents them. Phone numbers and URLs are curated here.
const RESOURCE_LIBRARY = {
  grounding: {
    title: 'Grounding & Calming',
    icon: '🌿',
    color: '#10b981',
    defaultContext: 'Simple, accessible tools for when you need to slow down and feel steady.',
    resources: [
      { name: 'Box Breathing', description: '4-count inhale, hold, exhale, hold — repeat 4 times to calm the nervous system', type: 'technique' },
      { name: '5-4-3-2-1 Grounding', description: 'Name 5 things you see, 4 you hear, 3 you can touch, 2 you smell, 1 you taste', type: 'technique' },
      { name: 'Progressive Muscle Relaxation', description: 'Tense and release each muscle group from toes to head — 15 to 20 minutes', type: 'technique' },
      { name: 'Physiological Sigh', description: 'Double inhale through nose, then long slow exhale through mouth — fastest known way to lower stress', type: 'technique' },
      { name: 'Body Scan Meditation', description: 'Lie down, close eyes, slowly move attention from feet to crown — notice without judgment', type: 'technique' },
      { name: 'Safe Place Visualization', description: 'Close your eyes and vividly imagine a place where you feel completely safe and calm', type: 'technique' },
      { name: 'Headspace', url: 'https://headspace.com', description: 'Guided meditation, breathing, and sleep tools — free trial available', type: 'app' },
      { name: 'Calm', url: 'https://calm.com', description: 'Sleep stories, meditations, and breathing exercises for daily stress', type: 'app' },
      { name: 'Insight Timer', url: 'https://insighttimer.com', description: 'Free library of 150,000+ guided meditations in dozens of languages', type: 'app' },
      { name: 'UCLA Mindful', url: 'https://www.uclahealth.org/programs/mindful', description: 'Free app with guided meditations in English and Spanish from UCLA', type: 'app' },
      { name: 'Stop, Breathe & Think', url: 'https://www.stopbreathethink.com', description: 'Check in emotionally, then get matched to a short meditation', type: 'app' },
      { name: 'The Tapping Solution', url: 'https://www.thetappingsolution.com', description: 'EFT tapping exercises for anxiety, stress, and overwhelm', type: 'app' },
      { name: 'PTSD Coach', url: 'https://www.ptsd.va.gov/appvid/mobile/ptsdcoach_app.asp', description: 'VA-developed grounding and coping tools — free, no account needed', type: 'app' },
      { name: 'Balance', url: 'https://www.balanceapp.com', description: 'Personalized daily meditation plans — free for the first year', type: 'app' },
    ],
  },
  emotional_support: {
    title: 'Emotional Support & Therapy',
    icon: '💬',
    color: '#8b5cf6',
    defaultContext: "Talking to someone trained to listen can help you process what you're carrying.",
    resources: [
      { name: 'BetterHelp', url: 'https://betterhelp.com', description: 'Online therapy — text, video, or phone sessions with licensed therapists', type: 'service' },
      { name: 'Talkspace', url: 'https://talkspace.com', description: 'Online therapy and psychiatry — covered by many major insurance plans', type: 'service' },
      { name: 'Open Path Collective', url: 'https://openpathcollective.org', description: 'Affordable in-person and online therapy, $30–$80 per session', type: 'service' },
      { name: 'Psychology Today', url: 'https://www.psychologytoday.com/us/therapists', description: 'Find local therapists filterable by specialty, insurance, and identity', type: 'directory' },
      { name: 'Alma', url: 'https://helloalma.com', description: 'Insurance-covered therapist network with diverse providers nationwide', type: 'directory' },
      { name: 'TherapyDen', url: 'https://therapyden.com', description: 'Find LGBTQ+-affirming, BIPOC, and culturally competent therapists', type: 'directory' },
      { name: 'Cerebral', url: 'https://cerebral.com', description: 'Online therapy and medication management for anxiety and depression', type: 'service' },
      { name: 'SAMHSA Helpline', description: 'Call 1-800-662-4357 — free, confidential mental health and substance use referrals, 24/7', type: 'hotline' },
      { name: 'NAMI Helpline', description: 'Call 1-800-950-6264 (Mon–Fri, 10am–10pm ET) — support, info, and referrals', type: 'hotline' },
      { name: '7 Cups', url: 'https://7cups.com', description: 'Free anonymous chat with trained volunteer listeners — 24/7', type: 'service' },
      { name: 'Peer Support Line', url: 'https://peersupportline.org', description: 'Free peer-to-peer emotional support by phone — trained volunteers who get it', type: 'service' },
      { name: 'Warmline Directory', url: 'https://warmline.org', description: 'Find your state warmline — someone to talk to before crisis hits', type: 'hotline' },
    ],
  },
  mental_health: {
    title: 'Mental Health & Wellbeing',
    icon: '🧠',
    color: '#6366f1',
    defaultContext: 'Resources for understanding and supporting your mental wellbeing over time.',
    resources: [
      { name: 'NAMI', url: 'https://nami.org', description: 'National Alliance on Mental Illness — education, helpline, advocacy, and local support groups', type: 'organization' },
      { name: 'Mental Health America', url: 'https://mhanational.org', description: 'Free screening tools, resources, and local affiliate support across the US', type: 'organization' },
      { name: 'NIMH', url: 'https://www.nimh.nih.gov', description: 'National Institute of Mental Health — research-backed info on every condition', type: 'resource' },
      { name: 'SAMHSA', url: 'https://www.samhsa.gov', description: 'Federal mental health and addiction resources — nationwide treatment locator', type: 'organization' },
      { name: 'AFSP', url: 'https://afsp.org', description: 'American Foundation for Suicide Prevention — resources, research, survivor support', type: 'organization' },
      { name: 'DBSA', url: 'https://www.dbsalliance.org', description: 'Depression and Bipolar Support Alliance — free online and in-person peer groups', type: 'community' },
      { name: 'Anxiety & Depression Association', url: 'https://adaa.org', description: 'Evidence-based resources, therapist finder, and support groups for anxiety and depression', type: 'organization' },
      { name: 'Sanvello', url: 'https://sanvello.com', description: 'CBT-based app for anxiety, depression, and stress — free tier available', type: 'app' },
      { name: 'Woebot', url: 'https://woebothealth.com', description: 'AI-powered CBT mental health support chatbot', type: 'app' },
      { name: 'Wysa', url: 'https://wysa.io', description: 'AI mental health companion with evidence-based tools and optional human coaching', type: 'app' },
      { name: 'Daylio', url: 'https://daylio.net', description: 'Micro mood journal and habit tracker — identify your emotional patterns over time', type: 'app' },
      { name: 'Finch', url: 'https://finchcare.com', description: 'Self-care app framed around caring for a virtual bird — gentle, low-pressure support', type: 'app' },
      { name: 'MentalHealth.gov', url: 'https://www.mentalhealth.gov', description: 'US government mental health information, treatment locator, and help guides', type: 'resource' },
      { name: 'NAMI Connection Recovery Support', url: 'https://nami.org/Support-Education/Support-Groups/NAMI-Connection', description: 'Free weekly peer-led support groups for adults living with mental illness', type: 'community' },
    ],
  },
  relationship: {
    title: 'Relationship & Family Support',
    icon: '🤝',
    color: '#ec4899',
    defaultContext: 'Support for navigating difficult relationships, conflict, and family dynamics.',
    resources: [
      { name: 'National DV Hotline', description: '1-800-799-7233 or text START to 88788 — 24/7 domestic violence support', type: 'hotline', url: 'https://thehotline.org' },
      { name: 'Love Is Respect', url: 'https://loveisrespect.org', description: 'Relationship abuse resources — call 1-866-331-9474 or text LOVEIS to 22522', type: 'hotline' },
      { name: 'WomensLaw.org', url: 'https://womenslaw.org', description: 'State-by-state legal information for abuse survivors — confidential live chat available', type: 'resource' },
      { name: 'Safe Horizon', url: 'https://safehorizon.org', description: 'Crisis support for victims of violence and abuse — call 1-800-621-4673', type: 'service' },
      { name: 'DomesticShelters.org', url: 'https://www.domesticshelters.org', description: 'Find local domestic violence shelters and services by zip code', type: 'directory' },
      { name: 'Futures Without Violence', url: 'https://www.futureswithoutviolence.org', description: 'Resources for survivors and anyone supporting a person through abuse', type: 'organization' },
      { name: 'Relationship Hero', url: 'https://relationshiphero.com', description: 'Online relationship coaches available 24/7 for any situation', type: 'service' },
      { name: 'Codependents Anonymous', url: 'https://coda.org', description: 'Free 12-step support groups for unhealthy relationship patterns', type: 'community' },
      { name: 'Al-Anon', url: 'https://al-anon.org', description: "Peer support for families and friends affected by someone else's drinking", type: 'community' },
      { name: 'Nar-Anon', url: 'https://nar-anon.org', description: 'Support groups for family members of people with addiction', type: 'community' },
      { name: 'Psychology Today — Therapists', url: 'https://www.psychologytoday.com/us/therapists', description: 'Filter for relationship, family, or trauma specialists in your area', type: 'directory' },
    ],
  },
  parenting: {
    title: 'Parenting & Co-Parenting',
    icon: '🌻',
    color: '#f59e0b',
    defaultContext: 'Support for parents navigating stress, single parenting, or co-parenting challenges.',
    resources: [
      { name: 'Childhelp Hotline', description: '1-800-422-4453 — support for parents under stress and children in need', type: 'hotline' },
      { name: 'Boys Town National Hotline', description: '1-800-448-3000 — 24/7 crisis and parenting support for parents and teens', type: 'hotline' },
      { name: 'Parents Helpline', description: '1-855-427-2736 — emotional support and local referrals for struggling parents', type: 'hotline' },
      { name: 'Postpartum Support International', url: 'https://postpartum.net', description: 'Postpartum depression and anxiety support — call 1-800-944-4773', type: 'hotline' },
      { name: 'Child Mind Institute', url: 'https://childmind.org', description: 'Expert guidance on child and teen mental health — free articles and guides by age', type: 'resource' },
      { name: 'Zero to Three', url: 'https://zerotothree.org', description: 'Parenting resources and developmental support for children ages 0–3', type: 'resource' },
      { name: 'Our Family Wizard', url: 'https://ourfamilywizard.com', description: 'Co-parenting communication and scheduling — court-accepted documentation', type: 'tool' },
      { name: 'TalkingParents', url: 'https://talkingparents.com', description: 'Documented co-parenting messaging — timestamped records for legal use', type: 'tool' },
      { name: 'CHADD', url: 'https://chadd.org', description: 'Resources for parents of children with ADHD — helpline and local support groups', type: 'resource' },
      { name: 'CDC Positive Parenting Tips', url: 'https://www.cdc.gov/ncbddd/childdevelopment/positiveparenting/index.html', description: 'Evidence-based parenting tips from the CDC, organized by child age', type: 'resource' },
      { name: 'Teen Line', url: 'https://teenline.org', description: 'Teen-to-teen crisis support — text TEEN to 839863 or call 1-800-852-8336', type: 'hotline' },
      { name: 'Circle of Security', url: 'https://www.circleofsecurityinternational.com', description: 'Attachment-based parenting program — find local facilitators', type: 'resource' },
    ],
  },
  legal: {
    title: 'Legal Aid & Rights',
    icon: '⚖️',
    color: '#64748b',
    defaultContext: 'Understanding your rights and finding help navigating legal processes.',
    resources: [
      { name: 'LawHelp.org', url: 'https://lawhelp.org', description: 'Free legal information and attorney referrals by state', type: 'resource' },
      { name: 'Legal Services Corporation', url: 'https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help', description: 'Find free civil legal aid programs in your area', type: 'directory' },
      { name: 'ABA Free Legal Answers', url: 'https://abafreelegalanswers.org', description: 'Submit civil legal questions and get answers from volunteer attorneys — free', type: 'service' },
      { name: 'Avvo', url: 'https://avvo.com', description: 'Free legal Q&A community and attorney directory with ratings', type: 'directory' },
      { name: 'Nolo', url: 'https://nolo.com', description: 'Plain-English legal guides, self-help forms, and attorney finder', type: 'resource' },
      { name: 'Law Help Interactive', url: 'https://lawhelpinteractive.org', description: 'Create free court-ready legal documents for your situation', type: 'tool' },
      { name: 'FindLaw', url: 'https://findlaw.com', description: 'Free legal information, case law, and attorney directory', type: 'resource' },
      { name: 'Victims of Crime', url: 'https://victimsofcrime.org', description: 'Resources and compensation info for crime victims — helpline: 1-855-4-VICTIM', type: 'resource' },
      { name: 'WomensLaw Legal Help', url: 'https://womenslaw.org/find-help/i-need-help/email-hotline', description: 'Free legal information for abuse survivors — email hotline available', type: 'service' },
      { name: 'NNEDV Safety Net', url: 'https://nnedv.org/content/safety-net', description: 'Technology safety resources for survivors — protect your devices and accounts', type: 'resource' },
      { name: 'Tenant Resource Center', url: 'https://www.tenantresourcecenter.org', description: 'Tenant rights, housing law, and eviction defense resources', type: 'resource' },
    ],
  },
  housing: {
    title: 'Housing & Practical Needs',
    icon: '🏠',
    color: '#0ea5e9',
    defaultContext: 'Help finding stable housing and practical support in difficult times.',
    resources: [
      { name: '211 Helpline', url: 'https://211.org', description: 'Dial 2-1-1 — connects to local housing, food, utility, and emergency financial help', type: 'hotline' },
      { name: 'National Homelessness Hotline', description: '1-800-466-3537 — connects to local emergency shelters and housing services', type: 'hotline' },
      { name: 'HUD Housing Assistance', url: 'https://www.hud.gov/topics/rental_assistance', description: 'Federal rental and housing voucher programs — find your local HUD office', type: 'resource' },
      { name: 'NLIHC Resource Finder', url: 'https://nlihc.org/find-assistance', description: 'Find emergency rental assistance programs by state and county', type: 'directory' },
      { name: 'Benefits.gov', url: 'https://benefits.gov', description: 'Search all federal and state benefit programs you may qualify for', type: 'resource' },
      { name: 'Habitat for Humanity', url: 'https://habitat.org', description: 'Affordable homeownership programs — find your local affiliate', type: 'organization' },
      { name: 'Salvation Army', url: 'https://salvationarmyusa.org', description: 'Emergency shelter, food assistance, and utility help nationwide', type: 'service' },
      { name: 'YWCA Emergency Shelter', url: 'https://www.ywca.org/what-we-do/housing-shelters', description: 'Emergency and transitional housing for women and families fleeing abuse', type: 'service' },
      { name: 'Community Action Agencies', url: 'https://communityactionpartnership.com/find-a-cap-agency', description: 'Locally-run agencies for emergency rent, utilities, and housing navigation', type: 'directory' },
      { name: 'SNAP Benefits', url: 'https://www.fns.usda.gov/snap', description: 'Federal food assistance — check eligibility and apply online in minutes', type: 'resource' },
      { name: 'Feeding America', url: 'https://feedingamerica.org/find-your-local-foodbank', description: 'Find your nearest food bank — no paperwork required at most locations', type: 'directory' },
    ],
  },
  burnout: {
    title: 'Burnout & Work Stress',
    icon: '🔋',
    color: '#f97316',
    defaultContext: 'When exhaustion runs deep, these tools can help you reclaim your energy.',
    resources: [
      { name: 'Employee Assistance Program (EAP)', description: 'Check with HR — most employers offer 3 to 8 free confidential counseling sessions', type: 'resource' },
      { name: 'OSHA Workers Rights', url: 'https://www.osha.gov/workers/file-complaint', description: 'File a complaint about unsafe or hostile workplace conditions — anonymously if needed', type: 'resource' },
      { name: 'National Labor Relations Board', url: 'https://nlrb.gov', description: 'Know your workplace rights and file unfair labor practice charges', type: 'resource' },
      { name: 'Mind — Workplace Stress', url: 'https://www.mind.org.uk/information-support/types-of-mental-health-problems/stress/workplace-stress/', description: 'Recognize, address, and communicate about workplace stress and burnout', type: 'resource' },
      { name: 'Headspace for Work', url: 'https://headspace.com/work', description: 'Mindfulness and burnout recovery tools designed for the workplace', type: 'app' },
      { name: 'Balance', url: 'https://www.balanceapp.com', description: 'Personalized daily meditation — free for the first year', type: 'app' },
      { name: 'Shine', url: 'https://www.theshineapp.com', description: 'Daily mood check-ins and affirmations — particularly supportive for BIPOC communities', type: 'app' },
      { name: 'Happify', url: 'https://happify.com', description: 'Science-based activities and games to reduce stress and build resilience', type: 'app' },
      { name: 'Burnout Index', url: 'https://burnoutindex.org', description: 'Free anonymous burnout assessment — measure your current risk level', type: 'tool' },
      { name: 'Calm Business', url: 'https://business.calm.com', description: 'Employer-sponsored meditation and stress tools — ask HR if your company offers it', type: 'app' },
    ],
  },
  grief: {
    title: 'Grief & Loss',
    icon: '🕊️',
    color: '#94a3b8',
    defaultContext: 'Support for navigating grief, loss, and the feelings that come with major endings.',
    resources: [
      { name: 'GriefShare', url: 'https://griefshare.org', description: 'Find local and online grief support groups by zip code', type: 'community' },
      { name: "What's Your Grief", url: 'https://whatsyourgrief.com', description: 'Articles, tools, and community for grief of every kind', type: 'resource' },
      { name: 'The Dougy Center', url: 'https://www.dougy.org', description: 'Grief support for children, teens, young adults, and families', type: 'organization' },
      { name: 'The Compassionate Friends', url: 'https://www.compassionatefriends.org', description: 'Support for families grieving the death of a child — chapters nationwide', type: 'community' },
      { name: 'Modern Loss', url: 'https://modernloss.com', description: 'Candid essays, resources, and community about navigating real grief', type: 'resource' },
      { name: 'Alliance of Hope', url: 'https://allianceofhope.org', description: "Online support community for loss survivors after a loved one's suicide", type: 'community' },
      { name: 'SOSL', url: 'https://www.survivorsofsuicideloss.org', description: 'Survivors of Suicide Loss — peer community and healing resources', type: 'community' },
      { name: 'Option B', url: 'https://optionb.org', description: 'Resilience tools and community for grief, loss, and adversity of all kinds', type: 'resource' },
      { name: 'National Widowers Organization', url: 'https://nationalwidowers.org', description: 'Community and resources specifically for widowers navigating loss', type: 'community' },
      { name: 'Rainbows International', url: 'https://rainbows.org', description: 'Peer support programs for children and adults grieving life losses', type: 'community' },
    ],
  },
  community: {
    title: 'Connection & Community',
    icon: '🌱',
    color: '#34d399',
    defaultContext: "You don't have to carry this alone — finding connection can make a real difference.",
    resources: [
      { name: '7 Cups', url: 'https://7cups.com', description: 'Free anonymous chat with trained volunteer listeners — 24/7', type: 'service' },
      { name: 'Meetup', url: 'https://meetup.com', description: 'Find local groups built around shared interests and experiences', type: 'community' },
      { name: 'SMART Recovery', url: 'https://smartrecovery.org', description: 'Free science-based support groups for any behavioral challenge', type: 'community' },
      { name: 'DBSA Online Support Groups', url: 'https://www.dbsalliance.org/support/chapters-and-support-groups/online-support-groups', description: 'Free online peer support groups for depression and bipolar disorder', type: 'community' },
      { name: 'Warmline Directory', url: 'https://warmline.org', description: 'Find your state warmline — peer support before you reach crisis', type: 'hotline' },
      { name: 'NAMI Connection', url: 'https://nami.org/Support-Education/Support-Groups/NAMI-Connection', description: 'Free weekly peer-led support groups for adults with mental illness', type: 'community' },
      { name: 'Emotions Anonymous', url: 'https://emotionsanonymous.org', description: '12-step program for emotional health — in-person and virtual meetings', type: 'community' },
      { name: 'Recovery International', url: 'https://recoveryinternational.org', description: 'Free peer-led mental wellness meetings — long-running, evidence-informed', type: 'community' },
      { name: 'Mental Health America Support Groups', url: 'https://mhanational.org/find-support-groups', description: 'Find peer support groups near you through local MHA affiliates', type: 'community' },
    ],
  },
  trauma: {
    title: 'Trauma & PTSD',
    icon: '🛡️',
    color: '#a78bfa',
    defaultContext: "Trauma shapes how we feel in ways that aren't always obvious — specialized support can make a real difference.",
    resources: [
      { name: 'RAINN', url: 'https://rainn.org', description: 'Sexual assault support — call 1-800-656-HOPE (4673) or chat online, 24/7', type: 'hotline' },
      { name: 'PTSD Coach', url: 'https://www.ptsd.va.gov/appvid/mobile/ptsdcoach_app.asp', description: 'VA-developed app for PTSD symptoms — grounding, coping tools, and psychoeducation', type: 'app' },
      { name: 'National Child Traumatic Stress Network', url: 'https://nctsn.org', description: 'Trauma resources for children, teens, and families — find specialized treatment', type: 'organization' },
      { name: 'EMDR International Association', url: 'https://emdria.org', description: 'Find a certified EMDR therapist for trauma processing and reprocessing', type: 'directory' },
      { name: 'Sidran Institute', url: 'https://sidran.org', description: 'Traumatic stress education and advocacy — helpdesk assists with treatment referrals', type: 'organization' },
      { name: 'After Silence', url: 'https://aftersilence.org', description: 'Online peer community and message boards for sexual assault survivors', type: 'community' },
      { name: 'SAMHSA Trauma Resources', url: 'https://www.samhsa.gov/trauma-violence', description: 'Trauma-informed care resources, treatment locator, and educational guides', type: 'resource' },
      { name: 'Self-Compassion.org', url: 'https://self-compassion.org', description: 'Free guided meditations and exercises for self-compassion and healing', type: 'resource' },
      { name: 'Gift From Within', url: 'https://giftfromwithin.org', description: 'PTSD education, personal stories, and peer support connections', type: 'resource' },
      { name: '1in6', url: 'https://1in6.org', description: 'Support and resources for men who have experienced unwanted or abusive sexual experiences', type: 'resource' },
      { name: 'National Center for PTSD', url: 'https://www.ptsd.va.gov', description: 'VA-backed research, tools, and treatment information for PTSD', type: 'resource' },
    ],
  },
  addiction: {
    title: 'Addiction & Recovery',
    icon: '🌊',
    color: '#06b6d4',
    defaultContext: "Recovery is nonlinear and hard — but real support exists, and you don't have to do it alone.",
    resources: [
      { name: 'SAMHSA National Helpline', description: '1-800-662-4357 — free, confidential treatment referrals for substance use, 24/7, English and Spanish', type: 'hotline' },
      { name: 'AA — Alcoholics Anonymous', url: 'https://aa.org', description: 'Find local and online meetings for alcohol recovery — worldwide 12-step community', type: 'community' },
      { name: 'NA — Narcotics Anonymous', url: 'https://na.org', description: 'Find meetings for drug addiction recovery — supportive worldwide community', type: 'community' },
      { name: 'SMART Recovery', url: 'https://smartrecovery.org', description: 'Science-based alternative to 12-step — free in-person and online meetings', type: 'community' },
      { name: 'In The Rooms', url: 'https://intherooms.com', description: 'Online recovery meetings for 29 fellowships — available any time of day', type: 'community' },
      { name: 'Refuge Recovery', url: 'https://refugerecovery.org', description: 'Buddhist-inspired addiction recovery program — find local meetings', type: 'community' },
      { name: 'Hazelden Betty Ford', url: 'https://hazeldenbettyford.org', description: 'Addiction treatment, recovery resources, and a 24/7 helpline', type: 'service' },
      { name: 'NIDA', url: 'https://nida.nih.gov', description: 'National Institute on Drug Abuse — research-based info on addiction and treatment options', type: 'resource' },
      { name: 'Sober Grid', url: 'https://www.sobergrid.com', description: 'Social recovery network — connect with sober support whenever you need it', type: 'community' },
      { name: 'Nar-Anon', url: 'https://nar-anon.org', description: 'Support groups for family members and friends of people struggling with addiction', type: 'community' },
      { name: 'CRAFT Resources', url: 'https://craftapproach.com', description: 'Community Reinforcement and Family Training — evidence-based help for families', type: 'resource' },
    ],
  },
  financial: {
    title: 'Financial Hardship',
    icon: '💰',
    color: '#84cc16',
    defaultContext: 'Financial stress is real and grinding — practical help and expert guidance are available.',
    resources: [
      { name: '211 Helpline', url: 'https://211.org', description: 'Dial 2-1-1 — emergency financial, food, and utility help in your area', type: 'hotline' },
      { name: 'NFCC Credit Counseling', url: 'https://nfcc.org', description: 'National Foundation for Credit Counseling — free and low-cost debt and budget help', type: 'service' },
      { name: 'Consumer Financial Protection Bureau', url: 'https://consumerfinance.gov', description: 'Know your financial rights, submit complaints, and use free financial tools', type: 'resource' },
      { name: 'Benefits.gov', url: 'https://benefits.gov', description: 'Find all federal and state benefit programs you may qualify for', type: 'resource' },
      { name: 'SNAP Benefits', url: 'https://www.fns.usda.gov/snap', description: 'Federal food assistance — check eligibility and apply online in minutes', type: 'resource' },
      { name: 'LIHEAP', url: 'https://www.acf.hhs.gov/ocs/programs/liheap', description: 'Low Income Home Energy Assistance — help with heating and cooling bills', type: 'resource' },
      { name: 'Modest Needs', url: 'https://modestneeds.org', description: 'Small emergency grants for working people facing unexpected financial shortfalls', type: 'service' },
      { name: 'Feeding America', url: 'https://feedingamerica.org/find-your-local-foodbank', description: 'Find your nearest food bank — no income documentation required at most locations', type: 'directory' },
      { name: 'GreenPath Financial Wellness', url: 'https://greenpath.com', description: 'Nonprofit credit counseling and debt management — call 1-877-337-3399', type: 'service' },
      { name: 'Social Security Benefits', url: 'https://www.ssa.gov/benefits', description: 'Apply for disability, retirement, or survivor benefits from the SSA', type: 'resource' },
      { name: 'NerdWallet', url: 'https://www.nerdwallet.com', description: 'Free tools to compare financial products, manage debt, and build credit', type: 'tool' },
    ],
  },
  lgbtq: {
    title: 'LGBTQ+ Support',
    icon: '🏳️‍🌈',
    color: '#f472b6',
    defaultContext: 'Affirming support that understands your experience — for every part of the LGBTQ+ community.',
    resources: [
      { name: 'The Trevor Project', url: 'https://thetrevorproject.org', description: 'Crisis support for LGBTQ+ youth — call 1-866-488-7386, text START to 678-678, 24/7', type: 'hotline' },
      { name: 'Trans Lifeline', url: 'https://translifeline.org', description: 'Peer support hotline run by trans people for trans people — 877-565-8860', type: 'hotline' },
      { name: 'PFLAG', url: 'https://pflag.org', description: 'Support for LGBTQ+ people, their families, and allies — find local chapters', type: 'community' },
      { name: 'GLSEN', url: 'https://glsen.org', description: 'Safe and affirming schools for LGBTQ+ students — resources for students and educators', type: 'organization' },
      { name: 'Lambda Legal', url: 'https://lambdalegal.org', description: 'Legal protection for LGBTQ+ civil rights — helpline for legal questions', type: 'resource' },
      { name: 'National Center for Transgender Equality', url: 'https://transequality.org', description: 'Policy advocacy and practical resources for transgender rights', type: 'organization' },
      { name: 'It Gets Better Project', url: 'https://itgetsbetter.org', description: 'Stories and resources affirming LGBTQ+ youth — community and global mentorship', type: 'resource' },
      { name: 'SAGE', url: 'https://sageusa.org', description: 'Services and advocacy for LGBTQ+ elders — National Hotline: 1-877-360-5428', type: 'hotline' },
      { name: 'TherapyDen', url: 'https://therapyden.com', description: 'Find LGBTQ+-affirming therapists who understand your lived experience', type: 'directory' },
      { name: 'True Colors United', url: 'https://truecolorsunited.org', description: 'Preventing and ending homelessness among LGBTQ+ youth', type: 'organization' },
      { name: 'GLAAD', url: 'https://glaad.org/resources', description: 'Advocacy resources and community support for LGBTQ+ acceptance and representation', type: 'organization' },
    ],
  },
  veterans: {
    title: 'Veterans & Military',
    icon: '🎖️',
    color: '#78716c',
    defaultContext: 'Specialized mental health and practical support for veterans and active-duty military.',
    resources: [
      { name: 'Veterans Crisis Line', description: 'Call 988 then press 1 — or text 838255 — free, confidential, 24/7 for vets and family', type: 'hotline', url: 'https://veteranscrisisline.net' },
      { name: 'VA Mental Health Services', url: 'https://mentalhealth.va.gov', description: 'PTSD, depression, MST, and addiction treatment — find a VA facility near you', type: 'service' },
      { name: 'Give an Hour', url: 'https://giveanhour.org', description: 'Free mental health care for post-9/11 veterans, service members, and families', type: 'service' },
      { name: 'Headstrong', url: 'https://goheadstrong.org', description: 'Free mental health treatment for post-9/11 veterans — no paperwork, no copays', type: 'service' },
      { name: 'Stop Soldier Suicide', url: 'https://stopsoldiersuicide.org', description: 'Crisis intervention and ongoing mental health support for at-risk veterans', type: 'service' },
      { name: 'Vets4Warriors', url: 'https://vets4warriors.com', description: '24/7 peer support by veterans for veterans — call 1-855-838-8255', type: 'hotline' },
      { name: 'Cohen Veterans Network', url: 'https://cohenveteransnetwork.org', description: 'Free mental health care at clinics across the US for vets and families', type: 'service' },
      { name: 'Wounded Warrior Project', url: 'https://woundedwarriorproject.org', description: 'Programs for physical, mental, and financial wellness for injured veterans', type: 'organization' },
      { name: 'DAV — Disabled American Veterans', url: 'https://dav.org', description: 'Benefits assistance, advocacy, and employment support for disabled veterans', type: 'organization' },
      { name: 'NAMI Veterans', url: 'https://www.nami.org/Your-Journey/Veterans-Active-Duty', description: 'Mental health resources and peer support specifically tailored to veterans', type: 'resource' },
    ],
  },
  chronic_illness: {
    title: 'Chronic Illness & Disability',
    icon: '🌡️',
    color: '#22d3ee',
    defaultContext: 'Living with chronic illness or disability is exhausting — you deserve real support for that reality.',
    resources: [
      { name: 'Patient Advocate Foundation', url: 'https://patientadvocate.org', description: 'Free case management for chronic illness patients — insurance, billing, and debt help', type: 'service' },
      { name: 'HealthWell Foundation', url: 'https://healthwellfoundation.org', description: 'Grants for out-of-pocket healthcare costs for underinsured patients', type: 'service' },
      { name: 'American Chronic Pain Association', url: 'https://theacpa.org', description: 'Peer support groups and self-management tools for chronic pain', type: 'community' },
      { name: 'NORD', url: 'https://rarediseases.org', description: 'National Organization for Rare Disorders — patient assistance and disease-specific resources', type: 'organization' },
      { name: 'Social Security Disability', url: 'https://ssa.gov/disability', description: 'Apply for SSDI or SSI if your condition prevents full-time work', type: 'resource' },
      { name: 'Disability Rights Advocates', url: 'https://dralegal.org', description: 'Free legal representation for disability discrimination cases', type: 'service' },
      { name: 'Caregiver Action Network', url: 'https://caregiveraction.org', description: 'Support and education for family caregivers of people with chronic illness', type: 'resource' },
      { name: "Ben's Friends", url: 'https://bensfriends.org', description: 'Online peer support communities specifically for rare disease patients', type: 'community' },
      { name: 'BrainLine', url: 'https://brainline.org', description: 'Resources for traumatic brain injury survivors and their family members', type: 'resource' },
      { name: 'NAMI Chronic Illness', url: 'https://nami.org', description: 'Mental health resources for those managing co-occurring chronic conditions', type: 'resource' },
    ],
  },
  crisis: {
    title: 'Crisis & Immediate Safety',
    icon: '🆘',
    color: '#f59e0b',
    isCrisis: true,
    defaultContext: "If you're struggling right now, these resources are here for you — free, confidential, and always available.",
    resources: [
      { name: '988 Suicide & Crisis Lifeline', description: 'Call or text 988 — free, confidential, 24/7 for anyone in distress', type: 'hotline' },
      { name: 'Crisis Text Line', description: 'Text HOME to 741741 — free, confidential text-based crisis support, 24/7', type: 'hotline' },
      { name: 'Veterans Crisis Line', description: 'Call 988 then press 1, or text 838255 — for veterans and their families, 24/7', type: 'hotline', url: 'https://veteranscrisisline.net' },
      { name: 'Trevor Project', description: 'Call 1-866-488-7386 or text START to 678-678 — LGBTQ+ youth crisis support, 24/7', type: 'hotline', url: 'https://thetrevorproject.org' },
      { name: 'Trans Lifeline', description: 'Call 877-565-8860 — peer crisis support run by trans people for trans people', type: 'hotline', url: 'https://translifeline.org' },
      { name: 'RAINN', description: 'Call 1-800-656-HOPE (4673) or chat online — sexual assault support, 24/7', type: 'hotline', url: 'https://rainn.org' },
      { name: 'National DV Hotline', description: 'Call 1-800-799-7233 or text START to 88788 — domestic violence support, 24/7', type: 'hotline', url: 'https://thehotline.org' },
      { name: 'Safe Horizon', description: 'Call 1-800-621-4673 — crisis support for victims of violence and abuse', type: 'hotline', url: 'https://safehorizon.org' },
      { name: 'Emergency Services', description: 'Call 911 if you are in immediate physical danger', type: 'emergency' },
    ],
  },
}

const TYPE_STYLES = {
  hotline:      { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  service:      { bg: 'rgba(139,92,246,0.10)',  color: '#8b5cf6', border: 'rgba(139,92,246,0.22)' },
  technique:    { bg: 'rgba(16,185,129,0.10)',  color: '#10b981', border: 'rgba(16,185,129,0.22)' },
  app:          { bg: 'rgba(99,102,241,0.10)',  color: '#a5b4fc', border: 'rgba(99,102,241,0.22)' },
  community:    { bg: 'rgba(52,211,153,0.10)',  color: '#34d399', border: 'rgba(52,211,153,0.22)' },
  directory:    { bg: 'rgba(100,116,139,0.10)', color: '#94a3b8', border: 'rgba(100,116,139,0.20)' },
  resource:     { bg: 'rgba(100,116,139,0.08)', color: '#94a3b8', border: 'rgba(100,116,139,0.15)' },
  tool:         { bg: 'rgba(14,165,233,0.10)',  color: '#38bdf8', border: 'rgba(14,165,233,0.22)' },
  organization: { bg: 'rgba(99,102,241,0.08)',  color: '#a5b4fc', border: 'rgba(99,102,241,0.18)' },
  emergency:    { bg: 'rgba(239,68,68,0.10)',   color: '#f87171', border: 'rgba(239,68,68,0.22)' },
}

function TypeBadge({ type }) {
  const s = TYPE_STYLES[type] || TYPE_STYLES.resource
  return (
    <span style={{
      fontSize: 9, fontFamily: 'IBM Plex Mono',
      padding: '2px 6px', borderRadius: 20,
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {type}
    </span>
  )
}

function ResourceItem({ resource, isLast }) {
  const inner = (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      cursor: resource.url ? 'pointer' : 'default',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: resource.url ? 'var(--accent)' : 'var(--text-primary)',
          }}>
            {resource.name}
          </span>
          <TypeBadge type={resource.type} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {resource.description}
        </div>
      </div>
      {resource.url && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>↗</span>
      )}
    </div>
  )
  if (resource.url) {
    return (
      <a href={resource.url} target="_blank" rel="noopener noreferrer"
        style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </a>
    )
  }
  return inner
}

function CategoryCard({ categoryId, context, isCrisisSurface }) {
  const [expanded, setExpanded] = useState(false)
  const lib = RESOURCE_LIBRARY[categoryId]
  if (!lib) return null

  const isCrisis    = lib.isCrisis || isCrisisSurface
  const accentColor = isCrisis ? '#f59e0b' : lib.color

  return (
    <div style={{
      background: isCrisis ? 'rgba(245,158,11,0.025)' : 'var(--bg-card)',
      border: `1px solid ${accentColor}20`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 10,
    }}>
      <div onClick={() => setExpanded(x => !x)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 38, height: 38, flexShrink: 0, borderRadius: 9,
              background: `${accentColor}18`,
              border: `1px solid ${accentColor}28`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
            }}>
              {lib.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontFamily: 'Syne', fontWeight: 600,
                color: 'var(--text-primary)', marginBottom: 3,
              }}>
                {lib.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {context || lib.defaultContext}
              </div>
            </div>
          </div>
          <div style={{
            flexShrink: 0, padding: '4px 9px',
            background: expanded ? `${accentColor}14` : 'rgba(255,255,255,0.03)',
            border: `1px solid ${expanded ? accentColor + '38' : 'var(--border)'}`,
            borderRadius: 6,
            fontSize: 10, fontFamily: 'IBM Plex Mono',
            color: expanded ? accentColor : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}>
            {expanded ? 'collapse' : `${lib.resources.length} resources`}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${accentColor}15` }}>
          {lib.resources.map((r, i) => (
            <ResourceItem key={i} resource={r} isLast={i === lib.resources.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid var(--border)',
      borderRadius: 10, padding: '14px 18px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: 140, height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginBottom: 8 }} />
          <div style={{ width: '72%', height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.03)' }} />
        </div>
      </div>
    </div>
  )
}

export default function Resources() {
  const [profile, setProfile]         = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [generating, setGenerating]   = useState(false)
  const [error, setError]             = useState(null)

  const loadProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/resources')
      if (res.data.has_profile) {
        setProfile(res.data.profile)
        setGeneratedAt(res.data.generated_at)
      }
    } catch {
      setError('Could not load resources — check connection')
    }
    setLoading(false)
  }

  const generate = async (force = false) => {
    setGenerating(true)
    setError(null)
    try {
      const url = force ? '/api/resources/generate?force=true' : '/api/resources/generate'
      const res = await api.post(url)
      setProfile(res.data.profile)
      setGeneratedAt(res.data.generated_at)
    } catch {
      setError('Could not generate recommendations — try again in a moment')
    }
    setGenerating(false)
  }

  useEffect(() => { loadProfile() }, [])

  const ranked      = profile?.ranked_categories || []
  const surfaceCrisis = profile?.surface_crisis === true
  const crisisEntry = surfaceCrisis ? ranked.find(c => c.id === 'crisis') : null
  const mainEntries = crisisEntry ? ranked.filter(c => c.id !== 'crisis') : ranked

  const isStale = generatedAt &&
    (Date.now() - new Date(generatedAt).getTime()) > 7 * 24 * 60 * 60 * 1000

  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div>
      <PageHeader
        title="Resources"
        subtitle="Support tools and services, organized for you"
        actions={profile && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              onClick={() => generate(true)}
              disabled={generating}
              style={{
                padding: '7px 14px',
                background: generating ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.12)',
                border: '1px solid var(--border-bright)',
                borderRadius: 7,
                color: generating ? 'var(--text-muted)' : 'var(--accent)',
                fontSize: 11, cursor: generating ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
              }}
            >
              {generating ? '◌ Refreshing...' : '↺ Refresh'}
            </button>
            {generatedAt && (
              <span style={{
                fontSize: 10, fontFamily: 'IBM Plex Mono',
                color: isStale ? '#f59e0b' : 'var(--text-muted)',
              }}>
                {isStale ? '⚠ ' : ''}updated {fmtDate(generatedAt)}
              </span>
            )}
          </div>
        )}
      />

      {loading ? (
        <div>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div style={{
          padding: '14px 18px',
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10,
          fontSize: 12, fontFamily: 'IBM Plex Mono', color: '#ef4444',
        }}>
          {error}
        </div>
      ) : !profile ? (
        /* ── Empty / first-run state ── */
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 22,
          padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 76, height: 76, borderRadius: 20,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
          }}>
            🌿
          </div>
          <div>
            <div style={{
              fontFamily: 'Syne', fontSize: 19, fontWeight: 700,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              See what's here for you
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 380 }}>
              Based on what you've shared and your journal patterns, we'll surface the most
              relevant support resources — organized so the things most likely to help are easy to find.
            </div>
          </div>
          <button
            onClick={() => generate(false)}
            disabled={generating}
            style={{
              padding: '10px 28px', minWidth: 180,
              background: generating
                ? 'rgba(99,102,241,0.10)'
                : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              border: generating ? '1px solid var(--border)' : 'none',
              borderRadius: 8,
              color: generating ? 'var(--text-muted)' : '#fff',
              fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'Syne', fontWeight: 600,
            }}
          >
            {generating ? '◌ Personalizing...' : 'Show My Resources'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.6 }}>
            Uses your journal patterns and onboarding context. Nothing is shared externally.
          </div>
        </div>
      ) : (
        /* ── Profile loaded ── */
        <div>
          {/* Personalized intro blurb */}
          {profile.intro && (
            <div style={{
              padding: '14px 18px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--accent)',
              borderRadius: 10,
              marginBottom: 24,
            }}>
              <div style={{
                fontSize: 9, fontFamily: 'IBM Plex Mono',
                color: 'var(--accent)',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                marginBottom: 7,
              }}>
                Personalized for you
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {profile.intro}
              </div>
            </div>
          )}

          {/* Crisis — pinned to top only when signals justify it */}
          {crisisEntry && (
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 9, fontFamily: 'IBM Plex Mono', color: '#f59e0b',
                textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8,
              }}>
                If you need support right now
              </div>
              <CategoryCard categoryId="crisis" context={crisisEntry.context} isCrisisSurface />
            </div>
          )}

          {/* Main ranked categories */}
          {mainEntries.length > 0 && (
            <>
              <div style={{
                fontSize: 9, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8,
              }}>
                Resources for you
              </div>
              {mainEntries.map(entry => (
                <CategoryCard
                  key={entry.id}
                  categoryId={entry.id}
                  context={entry.context}
                  isCrisisSurface={false}
                />
              ))}
            </>
          )}

          {/* Privacy footer */}
          <div style={{
            marginTop: 32, padding: '12px 16px',
            background: 'rgba(255,255,255,0.015)',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0, paddingTop: 1 }}>🔒</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.65 }}>
              These recommendations are generated from your private journal patterns and onboarding context.
              Nothing is shared externally. Use the Refresh button as your situation changes over time.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
