export type Role = 'teacher' | 'student'
export type ConvStatus = 'open' | 'closed' | 'expired' | 'archived'
export type AccessMode = 'open' | 'roster' | 'code'

export interface Msg {
  id: string
  role: Role
  participant_id?: string | null
  name: string
  body?: string | null
  image_path?: string | null
  reply_to?: string | null
  reply?: { id: string; name: string; body?: string | null; has_image?: boolean } | null
  is_announcement?: boolean
  is_pinned?: boolean
  is_featured?: boolean
  deleted?: boolean
  deleted_by?: Role | null
  created_at: string
  updated_at: string
  mine?: boolean
  report_count?: number
  pending?: boolean
  kind?: MsgKind
  audio_path?: string | null
  audio_secs?: number | null
  reactions?: Record<string, number>
  my_reactions?: string[]
  teacher_reactions?: string[]
  poll?: PollInfo | null
}

export type MsgKind = 'text' | 'poll' | 'voice'
export interface PollInfo {
  options: string[]
  my_vote?: number | null
  total: number
  counts?: number[] | null
  voters?: { name: string; option: number }[][]
}
export const EMOJIS = ['👍', '❤️', '⭐', '✅', '🤔', '👏'] as const

export interface ConvInfo {
  id: string
  title: string
  description?: string | null
  grade?: string | null
  access_mode: AccessMode
  status: ConvStatus
  expires_at?: string | null
  teacher_name: string
  participant_count: number
  created_at: string
  secret_key?: string
  slug?: string
  hide_answers?: boolean
}

export interface StudentSession {
  token: string
  participant: { id: string; name: string; upload_key: string; is_blocked: boolean }
  conversation: ConvInfo & { secret_key: string; slug: string }
}

export interface DashboardRow {
  id: string
  title: string
  description: string | null
  grade: string | null
  slug: string
  access_mode: AccessMode
  status: ConvStatus
  is_closed: boolean
  is_archived: boolean
  expires_at: string | null
  is_demo: boolean
  created_at: string
  participant_count: number
  message_count: number
  unread_count: number
  report_count: number
  last_message_at: string | null
}

export interface ConversationRow {
  id: string
  owner_id: string
  slug: string
  secret_key: string
  title: string
  description: string | null
  grade: string | null
  access_mode: AccessMode
  is_closed: boolean
  is_archived: boolean
  expires_at: string | null
  teacher_last_read_at: string
  is_demo: boolean
  created_at: string
  updated_at: string
  hide_answers: boolean
  template_id: string | null
}

export interface ParticipantRow {
  id: string
  conversation_id: string
  roster_id: string | null
  name: string
  is_blocked: boolean
  is_demo: boolean
  joined_at: string
  last_seen_at: string
}

export interface RosterRow {
  id: string
  conversation_id: string
  name: string
  code: string
  created_at: string
}

export interface MessageRow {
  id: string
  conversation_id: string
  participant_id: string | null
  sender_role: Role
  sender_name: string
  body: string | null
  image_path: string | null
  reply_to: string | null
  is_announcement: boolean
  is_pinned: boolean
  is_featured: boolean
  deleted_at: string | null
  deleted_by: Role | null
  created_at: string
  updated_at: string
  kind: MsgKind
  poll_options: string[] | null
  audio_path: string | null
  audio_secs: number | null
}

export interface ReactionRow { message_id: string; participant_id: string | null; actor: string; emoji: string }
export interface VoteRow { message_id: string; participant_id: string; option: number }
export interface BoardRow { participant_id: string; name: string; points: number; featured: number; stars: number; messages?: number; votes?: number }
export interface TemplateItem { type: 'text' | 'poll'; body: string; options?: string[] }
export interface TemplateRow { id: string; title: string; description: string | null; grade: string | null; items: TemplateItem[]; created_at: string; updated_at: string }

export interface ReportRow {
  id: string
  message_id: string
  participant_id: string
  reason: string | null
  resolved: boolean
  created_at: string
}
