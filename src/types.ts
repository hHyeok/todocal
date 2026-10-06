export interface Due {
  date: string;
  datetime?: string | null;
  string: string;
  is_recurring: boolean;
  timezone?: string | null;
  lang?: string | null;
}

export interface Task {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  labels: string[];
  priority: number; // API 4 = 앱의 p1
  due: Due | null;
  deadline: { date: string } | null;
  duration: { amount: number; unit: "minute" | "day" } | null;
  checked: boolean;
  child_order: number;
  day_order: number;
  completed_at: string | null;
  note_count?: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  inbox_project?: boolean;
  child_order: number;
  parent_id: string | null;
  is_favorite: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface AppConfig {
  hasTodoist: boolean;
  hasAnthropic: boolean;
  hasAgy: boolean;
  hasGemini: boolean;
  hasAi: boolean;
  aiProvider: "claude" | "agy" | "gemini" | "none";
  model: string;
  mock: boolean;
}

export interface TaskPatch {
  content?: string;
  description?: string;
  labels?: string[];
  priority?: number;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  duration?: number | null;
  duration_unit?: "minute" | "day";
  deadline_date?: string | null;
}
