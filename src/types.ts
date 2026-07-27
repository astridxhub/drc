export interface Article {
  title: string
  imageUrl: string
  link: string
  category: string
  rating: string
  ranking: string
  metadata: string
  date: string
}

export interface ProcessedArticle extends Article {
  description: string
  hashtags: string[]
  imagePath: string
}

export interface AiResponse {
  description: string
  hashtags: string[]
}

export interface Config {
  openrouterApiKey: string
  groqApiKey: string
  groqBaseUrl: string
  aiModel: string
  facebookPageId: string
  facebookAccessToken: string
  postIntervalHours: number
  maxPostsPerRun: number
  newsSourceUrl: string
  logoPath: string
  imageWidth: number
  imageHeight: number
  imageStyle: string
}

export interface AnalyticsEntry {
  timestamp: string
  articleTitle: string
  articleLink: string
  success: boolean
  error?: string
  facebookPostId?: string
  durationMs: number
}

export interface HealthStatus {
  lastRun: string | null
  lastSuccess: string | null
  lastError: string | null
  consecutiveFailures: number
  totalPosts: number
  totalErrors: number
}
