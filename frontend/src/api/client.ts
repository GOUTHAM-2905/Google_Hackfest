import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 120_000,   // 2 min for LLM calls
});

// Global error interceptor — unwrap FastAPI detail field
api.interceptors.response.use(
    (res) => res,
    (err) => {
        const detail = err.response?.data?.detail;
        if (detail) err.message = typeof detail === 'string' ? detail : JSON.stringify(detail);
        return Promise.reject(err);
    },
);
