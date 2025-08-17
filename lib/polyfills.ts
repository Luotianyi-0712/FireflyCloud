// Polyfills for browser compatibility

// 确保File构造函数在所有环境中都能正常工作
if (typeof window !== 'undefined' && typeof File === 'undefined') {
  // 如果File构造函数不存在，创建一个简单的polyfill
  (window as any).File = function(fileBits: any[], fileName: string, options: any = {}) {
    const blob = new Blob(fileBits, { type: options.type || '' })
    const file = Object.create(blob)
    file.name = fileName
    file.lastModified = options.lastModified || Date.now()
    return file
  }
}

// 确保URL.createObjectURL在所有环境中都能正常工作
if (typeof window !== 'undefined' && typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = function(object: any) {
    return 'blob:' + Math.random().toString(36).substr(2, 9)
  }
  URL.revokeObjectURL = function(url: string) {
    // No-op for polyfill
  }
}

export {}
