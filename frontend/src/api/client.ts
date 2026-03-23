import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types'

interface ApiClient {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
  post<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
  put<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
  patch<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
}

const createApiClient = (baseURL: string) => {
  const axiosInstance = axios.create({
    baseURL,
    timeout: 300000,  // 5 分钟超时（适应 MaxCompute 等长时间查询）
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // 请求拦截器
  axiosInstance.interceptors.request.use(
    (config) => {
      // 从 localStorage 获取 token
      // JWT 认证
      const token = localStorage.getItem('auth_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // 响应拦截器
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
      return response.data as unknown as AxiosResponse
    },
    (error: AxiosError<ApiResponse>) => {
      // 统一错误处理
      if (error.response) {
        const { data, status } = error.response
        const requestUrl = error.config?.url || ''

        // 401 未授权
        if (status === 401) {
          localStorage.removeItem('auth_token')
          window.location.href = '/login'
        }

        if (status === 404 && requestUrl.includes('/semantic/catalogs')) {
          return Promise.reject(new Error('目录接口不存在，当前后端可能尚未加载最新版本，请重启后端服务后重试'))
        }

        // 返回错误信息
        if (typeof data === 'string') {
          return Promise.reject(new Error(status === 404 ? '请求的接口不存在' : data))
        }
        return Promise.reject(new Error(data?.message || '请求失败'))
      } else if (error.request) {
        // 区分超时和网络错误
        if (error.code === 'ECONNABORTED') {
          return Promise.reject(new Error('请求超时，查询可能仍在执行中，请稍后重试'))
        }
        return Promise.reject(new Error('网络错误，请检查您的网络连接'))
      } else {
        return Promise.reject(new Error('请求配置错误'))
      }
    }
  )

  return axiosInstance as unknown as ApiClient
}

const apiClient = createApiClient('/api/v1')

export default apiClient
