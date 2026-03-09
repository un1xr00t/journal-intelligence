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
      { name: 'Box Breathing', description: '4-count inhale · hold · exhale · hold — repeat 4 times', type: 'technique' },
      { name: '5-4-3-2-1 Grounding', description: 'Name 5 things you see, 4 you hear, 3 you can touch, 2 you smell, 1 you taste', type: 'technique' },
      { name: 'Headspace', url: 'https://headspace.com', description: 'Guided meditation and breathing exercises', type: 'app' },
      { name: 'Calm', url: 'https://calm.com', description: 'Sleep, meditation, and daily relaxation tools', type: 'app' },
      { name: 'Insight Timer', url: 'https://insighttimer.com', description: 'Free guided meditations — thousands of options', type: 'app' },
    ],
  },
  emotional_support: {
    title: 'Emotional Support & Therapy',
    icon: '💬',
    color: '#8b5cf6',
    defaultContext: "Talking to someone trained to listen can help you process what you're carrying.",
    resources: [
      { name: 'BetterHelp', url: 'https://betterhelp.com', description: 'Online therapy — text, video, or phone sessions', type: 'service' },
      { name: 'Open Path Collective', url: 'https://openpathcollective.org', description: 'Affordable in-person therapy, $30–$80/session', type: 'service' },
      { name: 'Psychology Today', url: 'https://www.psychologytoday.com/us/therapists', description: 'Find local therapists by specialty and insurance', type: 'directory' },
      { name: 'NAMI Helpline', description: 'Call 1-800-950-6264 (Mon–Fri, 10am–10pm ET)', type: 'hotline' },
      { name: '7 Cups', url: 'https://7cups.com', description: 'Free anonymous chat with trained listeners', type: 'service' },
    ],
  },
  mental_health: {
    title: 'Mental Health & Wellbeing',
    icon: '🧠',
    color: '#6366f1',
    defaultContext: 'Resources for understanding and supporting your mental wellbeing over time.',
    resources: [
      { name: 'NAMI', url: 'https://nami.org', description: 'National Alliance on Mental Illness — resources, helpline, support groups', type: 'organization' },
      { name: 'Anxiety & Depression Association', url: 'https://adaa.org', description: 'Find therapists, support groups, and resources', type: 'organization' },
      { name: 'MentalHealth.gov', url: 'https://www.mentalhealth.gov', description: 'US government mental health information', type: 'resource' },
      { name: 'Woebot', url: 'https://woebothealth.com', description: 'CBT-based mental health support app', type: 'app' },
    ],
  },
  relationship: {
    title: 'Relationship & Family Support',
    icon: '🤝',
    color: '#ec4899',
    defaultContext: 'Support for navigating difficult relationships, conflict, and family dynamics.',
    resources: [
      { name: 'National DV Hotline', description: '1-800-799-7233 or text START to 88788 — 24/7', type: 'hotline', url: 'https://thehotline.org' },
      { name: 'Love Is Respect', url: 'https://loveisrespect.org', description: 'Relationship support resources — text LOVEIS to 22522', type: 'hotline' },
      { name: 'Relationship Hero', url: 'https://relationshiphero.com', description: 'Online relationship coaches available 24/7', type: 'service' },
      { name: 'Codependents Anonymous', url: 'https://coda.org', description: 'Free support groups for relationship patterns', type: 'community' },
    ],
  },
  parenting: {
    title: 'Parenting & Co-Parenting',
    icon: '🌻',
    color: '#f59e0b',
    defaultContext: 'Support for parents navigating stress, single parenting, or co-parenting challenges.',
    resources: [
      { name: 'Childhelp Hotline', description: '1-800-422-4453 — support for parents and children', type: 'hotline' },
      { name: 'Zero to Three', url: 'https://zerotothree.org', description: 'Parenting resources, articles, and developmental support', type: 'resource' },
      { name: 'Our Family Wizard', url: 'https://ourfamilywizard.com', description: 'Co-parenting communication and scheduling tool', type: 'tool' },
      { name: 'Parents Helpline', description: '1-855-427-2736 — support for parents under stress', type: 'hotline' },
    ],
  },
  legal: {
    title: 'Legal Aid & Rights',
    icon: '⚖️',
    color: '#64748b',
    defaultContext: 'Understanding your rights and finding help navigating legal processes.',
    resources: [
      { name: 'LawHelp.org', url: 'https://lawhelp.org', description: 'Free legal information by state', type: 'resource' },
      { name: 'Legal Services Corporation', url: 'https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help', description: 'Find free civil legal aid in your area', type: 'directory' },
      { name: 'Avvo', url: 'https://avvo.com', description: 'Free legal Q&A and attorney directory', type: 'directory' },
      { name: 'Law Help Interactive', url: 'https://lawhelpinteractive.org', description: 'Create free legal documents for your situation', type: 'tool' },
    ],
  },
  housing: {
    title: 'Housing & Practical Needs',
    icon: '🏠',
    color: '#0ea5e9',
    defaultContext: 'Help finding stable housing and practical support in difficult times.',
    resources: [
      { name: '211 Helpline', url: 'https://211.org', description: 'Dial 2-1-1 — connects to local housing, food, and financial help', type: 'hotline' },
      { name: 'HUD Housing Assistance', url: 'https://www.hud.gov/topics/rental_assistance', description: 'Federal rental and housing assistance programs', type: 'resource' },
      { name: 'NLIHC Resource Finder', url: 'https://nlihc.org/find-assistance', description: 'Find rental assistance programs by state', type: 'directory' },
    ],
  },
  burnout: {
    title: 'Burnout & Work Stress',
    icon: '🔋',
    color: '#f97316',
    defaultContext: 'When exhaustion runs deep, these tools can help you reclaim your energy.',
    resources: [
      { name: 'Employee Assistance Program (EAP)', description: 'Check with your employer — many offer free confidential counseling', type: 'resource' },
      { name: "OSHA Workers' Rights", url: 'https://www.osha.gov/workers/file-complaint', description: 'Report unsafe or hostile workplace conditions', type: 'resource' },
      { name: 'Mind — Workplace Stress', url: 'https://www.mind.org.uk/information-support/types-of-mental-health-problems/stress/workplace-stress/', description: 'Recognize and address workplace stress', type: 'resource' },
    ],
  },
  grief: {
    title: 'Grief & Loss',
    icon: '🕊️',
    color: '#94a3b8',
    defaultContext: 'Support for navigating grief, loss, and the feelings that come with major endings.',
    resources: [
      { name: 'GriefShare', url: 'https://griefshare.org', description: 'Find local grief support groups near you', type: 'community' },
      { name: "What's Your Grief", url: 'https://whatsyourgrief.com', description: 'Articles, tools, and community for grief support', type: 'resource' },
      { name: 'Dougy Center', url: 'https://www.dougy.org', description: 'Support for grieving children, teens, and families', type: 'organization' },
    ],
  },
  community: {
    title: 'Connection & Community',
    icon: '🌱',
    color: '#34d399',
    defaultContext: "You don't have to carry this alone — finding connection can make a real difference.",
    resources: [
      { name: '7 Cups', url: 'https://7cups.com', description: 'Free anonymous chat with trained listeners', type: 'service' },
      { name: 'Meetup', url: 'https://meetup.com', description: 'Find local groups around shared interests', type: 'community' },
      { name: 'SMART Recovery', url: 'https://smartrecovery.org', description: 'Free support groups for behavioral challenges', type: 'community' },
    ],
  },
  crisis: {
    title: 'Crisis & Immediate Safety',
    icon: '🆘',
    color: '#f59e0b',
    isCrisis: true,
    defaultContext: "If you're struggling right now, these resources are here for you — free, confidential, and always available.",
    resources: [
      { name: '988 Suicide & Crisis Lifeline', description: 'Call or text 988 — free, confidential, 24/7', type: 'hotline' },
      { name: 'Crisis Text Line', description: 'Text HOME to 741741 — free, confidential, 24/7', type: 'hotline' },
      { name: 'National DV Hotline', description: '1-800-799-7233 or text START to 88788', type: 'hotline', url: 'https://thehotline.org' },
      { name: 'Emergency Services', description: 'Call 911 if you are in immediate danger', type: 'emergency' },
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
