/**
 * 测试脚本 - HuggingFace deepseek-ai (静态页面，不需要 puppeteer)
 *
 * 运行方式: npx ts-node nodes/SmartCrawler/test-huggingface.ts
 */

const { CrawlerEngine } = require('./CrawlerEngine');

async function main() {
	console.log('='.repeat(50));
	console.log('测试: HuggingFace deepseek-ai (静态模式)');
	console.log('='.repeat(50) + '\n');

	const result = await CrawlerEngine.crawl({
		url: 'https://huggingface.co/organizations/deepseek-ai/activity/all',
		listSelector: 'div.org-profile-content > div',
		maxItems: 2,
		fields: [
			{
				name: 'title',
				selector: 'header.mb-1',
				type: 'text',
			},
			{
				name: 'detail',
				selector: 'header.mb-1',
				type: 'text',
				isJump: true,
				jumpConfig: {
					clickSelector: 'a',
					targetSelector: 'div.model-card-content',
				}
			}
		]
	});

	console.log('结果:');
	console.log(JSON.stringify(result.data, null, 2));
	if (result.errors.length) console.log('错误:', result.errors);
}

main().catch(console.error);
