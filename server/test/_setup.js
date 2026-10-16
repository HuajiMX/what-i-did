/**
 * 测试环境准备。
 * 在加载任何应用模块之前清掉会干扰测试的配置，然后提供一个临时 .env 不存在也能跑的环境：
 *  config.js 在模块导入时就把 .env 读进 process.env 且不会覆盖已有值，
 *  所以必须在导入应用代码之前把测试要用的值先设好。
 */
delete process.env.ADMIN_PASSWORD_HASH;
process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";
process.env.SESSION_SECRET = "test-secret-that-is-definitely-long-enough-1234567890";
