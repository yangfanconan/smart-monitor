import { ref } from 'vue'

export interface Comment {
  id: number
  author: string
  content: string
  timestamp: string
  replies: Comment[]
}

export const commentList = ref<Comment[]>([])
