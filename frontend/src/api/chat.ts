import { api } from './client';
import type { ChatRequest, ChatResponse } from '../types/chat';

export const sendChatMessage = (req: ChatRequest): Promise<ChatResponse> =>
    api.post('/api/chat', req).then((r) => r.data);
