export type RoleGroup = {
  label: string | null
  roles: string[]
}

export type RoleCategory = {
  id: string
  label: string
  groups: RoleGroup[]
}

export const ROLE_TAXONOMY: RoleCategory[] = [
  {
    id: 'engineering',
    label: 'Engineering',
    groups: [
      {
        label: 'SOFTWARE',
        roles: [
          'Software Engineer',
          'Frontend Engineer',
          'Mobile Engineer',
          'DevOps Engineer',
          'QA Engineer',
        ],
      },
      {
        label: 'AI & DATA & ANALYTICS',
        roles: [
          'Machine Learning Engineer',
          'AI / LLM Engineer',
          'AI / ML Research',
          'Data Engineer',
          'Data Scientist',
          'Data Analyst',
        ],
      },
      {
        label: 'CYBERSECURITY',
        roles: [
          'Security Engineer',
          'Offensive Security & Pentesting',
          'SOC & Incident Response',
        ],
      },
      {
        label: 'OTHER',
        roles: [
          'Technical & Solutions Architect',
          'Engineering Manager',
          'IT & Systems Administration',
          'Database Administration',
        ],
      },
    ],
  },
  {
    id: 'product',
    label: 'Product',
    groups: [
      {
        label: null,
        roles: [
          'Product Manager',
          'Product Owner',
          'Technical Product Manager',
          'Product Designer',
          'UX Researcher',
          'UX Writer & Content Designer',
        ],
      },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    groups: [
      {
        label: null,
        roles: [
          'Account Executive',
          'Account Manager',
          'Sales Leadership',
          'Channel / Partner Sales',
          'Sales Development (SDR / BDR)',
          'Strategic Partnerships',
          'Sales Engineer',
        ],
      },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    groups: [
      {
        label: null,
        roles: [
          'Business Analyst',
          'Program Manager',
          'Project Manager',
          'Leadership Development Program',
          'Scrum Master & Agile Coach',
        ],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    groups: [
      {
        label: null,
        roles: [
          'Growth Marketing',
          'Digital / Performance Marketing',
          'Content Marketing',
          'Social Media / Community',
          'Marketing Operations',
          'Product Marketing',
          'Brand Marketing',
          'PR & External Communications',
          'Field & Event Marketing',
          'Graphic / Brand Design',
          'Motion / Video Production',
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    groups: [
      {
        label: 'CORPORATE FINANCE',
        roles: [
          'FP&A / Strategic Finance',
          'Accounting',
          'Financial Analyst',
          'Corporate Development & M&A',
          'Actuary / Insurance Analytics',
        ],
      },
      {
        label: 'INVESTMENT FINANCE',
        roles: [
          'Investment Banking',
          'Venture Capital / Private Equity',
          'Investor Relations',
          'Treasury & Capital Markets',
          'Sales & Trading',
          'Wealth Management / Private Banking',
          'Asset Management / Portfolio Management',
        ],
      },
    ],
  },
  {
    id: 'customer',
    label: 'Customer',
    groups: [
      {
        label: null,
        roles: [
          'Customer Success Manager',
          'Technical Support Engineer',
          'Implementation / Professional Services',
        ],
      },
    ],
  },
  {
    id: 'people-legal',
    label: 'People & Legal',
    groups: [
      {
        label: 'PEOPLE & TALENT',
        roles: [
          'Human Resources / People Ops',
          'Talent Acquisition / Recruiting',
          'Learning & Development',
        ],
      },
      {
        label: 'LEGAL & COMPLIANCE',
        roles: [
          'Legal',
          'Compliance & Risk Management',
          'Trust & Safety',
          'Financial Crimes & AML',
          'Privacy & Data Protection',
        ],
      },
    ],
  },
  {
    id: 'more',
    label: 'More',
    groups: [
      {
        label: 'STRATEGY & OPS',
        roles: [
          'Strategy & Operations',
          'Revenue / Sales Operations',
          'ESG / Sustainability',
        ],
      },
      {
        label: 'CONSULTING',
        roles: [
          'Strategy / Management Consulting',
          'Technology / IT Consulting',
          'Financial Advisory & Consulting',
        ],
      },
      {
        label: 'QUANTITATIVE FINANCE',
        roles: ['Quant Developer', 'Quant Research'],
      },
      {
        label: 'HARDWARE & EE',
        roles: [
          'Embedded / Firmware Engineer',
          'Semiconductor / Chip Design',
          'Electrical / Hardware Engineer',
          'Robotics Engineer',
          'Industrial Automation',
        ],
      },
      {
        label: 'OTHER',
        roles: ['Technical Writer', 'Developer Relations'],
      },
    ],
  },
]
