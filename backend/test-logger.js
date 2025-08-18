// 测试日志系统
const { logger } = require('./dist/utils/logger.js');

console.log('测试日志系统...');
console.log('当前日志级别:', process.env.LOG_LEVEL || 'INFO');

// 测试不同级别的日志
logger.debug('这是DEBUG日志');
logger.info('这是INFO日志');
logger.warn('这是WARN日志');
logger.error('这是ERROR日志');

// 测试HTTP日志
logger.http('GET', '/test', 200, 50, 'test-agent', '127.0.0.1');
logger.http('POST', '/api/test', 404, 25, 'test-agent', '192.168.1.1');
logger.http('PUT', '/api/update', 500, 150, 'test-agent', '10.0.0.1');

console.log('日志测试完成');
