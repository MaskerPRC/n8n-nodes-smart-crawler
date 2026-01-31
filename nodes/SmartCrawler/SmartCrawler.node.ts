import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import axios from 'axios';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import * as cheerio from 'cheerio';

interface FieldConfig {
	name: string;
	selector: string;
	type: 'text' | 'html' | 'attribute';
	attribute?: string;
	isJump?: boolean;
	jumpConfig?: JumpConfig;
}

interface JumpConfig {
	clickSelector: string;
	targetSelector?: string;
	fields?: FieldConfig[];
	nextJump?: JumpConfig;
}

interface FieldData {
	name: string;
	selector: string;
	type: 'text' | 'html' | 'attribute';
	attribute?: string;
	isJump?: boolean;
	jumpConfig?: Record<string, unknown>;
}

interface FieldsData {
	field?: FieldData[];
}

export class SmartCrawler implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Smart Crawler',
		name: 'smartCrawler',
		icon: 'file:../../icons/smart-crawler.svg',
		group: ['input'],
		version: 1,
		description: '通用智能爬虫节点，支持多跳数据提取',
		defaults: {
			name: 'Smart Crawler',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: '页面链接',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com',
				description: '要爬取的页面URL',
			},
			{
				displayName: 'Cookie',
				name: 'cookie',
				type: 'string',
				default: '',
				placeholder: 'session_id=xxx; user_id=yyy',
				description: '请求时使用的Cookie（可选）',
			},
			{
				displayName: '列表选择器',
				name: 'listSelector',
				type: 'string',
				required: true,
				default: '',
				placeholder: '.item, .product-item',
				description: '用于选择数据列表的CSS选择器',
			},
			{
				displayName: '字段配置',
				name: 'fields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				options: [
					{
						displayName: '字段',
						name: 'field',
						values: [
							{
						displayName: '是否为跳转字段',
						name: 'isJump',
						type: 'boolean',
						default: false,
						description: 'Whether to extract data from a jump page',
							},
							{
						displayName: '属性名',
						name: 'attribute',
						type: 'string',
						default: '',
						placeholder: 'href, src, data-ID',
						description: '当提取类型为属性值时，指定要提取的属性名',
							},
							{
						displayName: '提取类型',
						name: 'type',
						type: 'options',
						options: [
									{
										name: '文本内容',
										value: 'text',
									},
									{
										name: 'HTML内容',
										value: 'html',
									},
									{
										name: '属性值',
										value: 'attribute',
									},
								],
						default: 'text',
						description: '如何提取字段值',
							},
							{
						displayName: '跳转配置',
						name: 'jumpConfig',
						type: 'fixedCollection',
						default: {},
						options: [
									{
										displayName: '第一跳',
										name: 'firstJump',
											values:	[
													{
												displayName: '点击元素选择器',
												name: 'clickSelector',
												type: 'string',
													required:	true,
												default: '',
												placeholder: 'a.detail-link',
												description: '用于点击跳转的元素选择器',
													},
													{
												displayName: '目标页面数据选择器',
												name: 'targetSelector',
												type: 'string',
												default: '',
												placeholder: '.content,	#main',
												description: '跳转后页面中要提取数据的选择器（如果为空则提取整个页面）',
													},
													{
												displayName: '字段',
												name: 'fields',
												type: 'fixedCollection',
												default: {},
												options: [
															{
																displayName: '字段',
																name: 'field',
																	values: [
														{
															displayName: '是否为跳转字段',
															name: 'isJump',
															type: 'boolean',
															default: false,
														},
														{
															displayName: '属性名',
															name: 'attribute',
															type: 'string',
															default: '',
														},
														{
															displayName: '提取类型',
															name: 'type',
															type: 'options',
															options: [
																		{
																			name: '文本内容',
																			value: 'text',
																		},
																		{
																			name: 'HTML内容',
																			value: 'html',
																		},
																		{
																			name: '属性值',
																			value: 'attribute',
																		},
																	],
															default: 'text',
														},
														{
															displayName: '跳转配置',
															name: 'jumpConfig',
															type: 'fixedCollection',
															default: {},
															options: [
																		{
																			displayName: '第二跳',
																			name: 'secondJump',
																		values:	[
																				{
																					displayName: '点击元素选择器',
																					name: 'clickSelector',
																					type: 'string',
																						required:	true,
																					default: '',
																				},
																				{
																					displayName: '目标页面数据选择器',
																					name: 'targetSelector',
																					type: 'string',
																					default: '',
																				},
																				{
																					displayName: '字段',
																					name: 'fields',
																					type: 'fixedCollection',
																					default: {},
																					options: [
																								{
																									displayName: '字段',
																									name: 'field',
																								values: [
																			{
																				displayName: '是否为跳转字段',
																				name: 'isJump',
																				type: 'boolean',
																				default: false,
																			},
																			{
																				displayName: '属性名',
																				name: 'attribute',
																				type: 'string',
																				default: '',
																			},
																			{
																				displayName: '提取类型',
																				name: 'type',
																				type: 'options',
																				options: [
																							{
																								name: '文本内容',
																								value: 'text',
																							},
																							{
																								name: 'HTML内容',
																								value: 'html',
																							},
																							{
																								name: '属性值',
																								value: 'attribute',
																							},
																						],
																				default: 'text',
																			},
																			{
																				displayName: '跳转配置',
																				name: 'jumpConfig',
																				type: 'fixedCollection',
																				default: {},
																				options: [
																							{
																								displayName: '第三跳',
																								name: 'thirdJump',
																									values:	[
																									{
																										displayName: '点击元素选择器',
																										name: 'clickSelector',
																										type: 'string',
																											required:	true,
																										default: '',
																									},
																									{
																										displayName: '目标页面数据选择器',
																										name: 'targetSelector',
																										type: 'string',
																										default: '',
																									},
																									{
																										displayName: '字段',
																										name: 'fields',
																										type: 'fixedCollection',
																										default: {},
																										options: [
																													{
																														displayName: '字段',
																														name: 'field',
																															values:	[
																															{
																																displayName: '字段名称',
																																name: 'name',
																																type: 'string',
																																	required:	true,
																																default: '',
																															},
																															{
																																displayName: '选择器',
																																name: 'selector',
																																type: 'string',
																																	required:	true,
																																default: '',
																															},
																															{
																																displayName: '提取类型',
																																name: 'type',
																																type: 'options',
																																options: [
																																			{
																																				name: '文本内容',
																																				value: 'text',
																																			},
																																			{
																																				name: 'HTML内容',
																																				value: 'html',
																																			},
																																			{
																																				name: '属性值',
																																				value: 'attribute',
																																			},
																																	],
																																default: 'text',
																															},
																															{
																																displayName: '属性名',
																																name: 'attribute',
																																type: 'string',
																																default: '',
																															},
																															]
																													},
																											]
																									},
																									]
																							},
																					]
																			},
																			{
																				displayName: '选择器',
																				name: 'selector',
																				type: 'string',
																					required:	true,
																				default: '',
																			},
																			{
																				displayName: '字段名称',
																				name: 'name',
																				type: 'string',
																					required:	true,
																				default: '',
																			},
																			]
																								},
																						]
																				},
																		]
																		},
																]
														},
														{
															displayName: '选择器',
															name: 'selector',
															type: 'string',
																required:	true,
															default: '',
														},
														{
															displayName: '字段名称',
															name: 'name',
															type: 'string',
																required:	true,
															default: '',
														},
												]
															},
													]
													},
											]
									},
					]
							},
							{
						displayName: '选择器',
						name: 'selector',
						type: 'string',
							required:	true,
						default: '',
						placeholder: '.title,	#name',
						description: 'CSS选择器，用于提取字段值',
							},
							{
						displayName: '字段名称',
						name: 'name',
						type: 'string',
							required:	true,
						default: '',
						description: '字段的输出名称',
							},
					],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const url = this.getNodeParameter('url', itemIndex, '') as string;
				const cookie = this.getNodeParameter('cookie', itemIndex, '') as string;
				const listSelector = this.getNodeParameter('listSelector', itemIndex, '') as string;
				const fieldsData = this.getNodeParameter('fields', itemIndex, {}) as FieldsData;

				if (!url) {
					throw new NodeOperationError(this.getNode(), '页面链接不能为空', { itemIndex });
				}

				if (!listSelector) {
					throw new NodeOperationError(this.getNode(), '列表选择器不能为空', { itemIndex });
				}

				const fields = fieldsData.field || [];

				// 获取初始页面
				const response = await axios.get(url, {
					headers: {
						...(cookie && { Cookie: cookie }),
						'User-Agent':
							'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
					},
				});

				const $ = cheerio.load(response.data);
				const listItems = $(listSelector);

				if (listItems.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						`未找到匹配列表选择器 "${listSelector}" 的元素`,
						{ itemIndex },
					);
				}

				// 处理每个列表项
				for (let i = 0; i < listItems.length; i++) {
					const listItem = listItems.eq(i);
					const itemData: Record<string, unknown> = {};

					// 提取每个字段
					for (const field of fields) {
						try {
							const fieldValue = await SmartCrawler.extractField(
								this,
								listItem,
								field,
								url,
								cookie,
								1,
							);
							itemData[field.name] = fieldValue;
						} catch (error) {
							if (this.continueOnFail()) {
								itemData[field.name] = null;
							} else {
								throw error;
							}
						}
					}

					returnData.push({
						json: itemData as IDataObject,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: itemIndex },
					});
				} else {
					throw new NodeOperationError(this.getNode(), error, { itemIndex });
				}
			}
		}

		return [returnData];
	}

	private static async extractField(
		executeFunctions: IExecuteFunctions,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		$element: cheerio.Cheerio<any>,
		field: FieldData,
		baseUrl: string,
		cookie: string,
		jumpLevel: number,
	): Promise<unknown> {
		if (jumpLevel > 3) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				'最多支持3跳，已达到最大跳数限制',
			);
		}

		const element = $element.find(field.selector).first();

		if (element.length === 0) {
			return null;
		}

		// 如果不是跳转字段，直接提取值
		if (!field.isJump || !field.jumpConfig) {
			return SmartCrawler.extractValue(element, field.type, field.attribute);
		}

		// 处理跳转字段
		if (!field.jumpConfig) {
			return null;
		}
		const jumpConfig = SmartCrawler.getJumpConfig(
			field.jumpConfig as Record<string, unknown>,
			jumpLevel,
		);
		if (!jumpConfig) {
			return null;
		}

		// 获取跳转链接
		const clickElement = element.find(jumpConfig.clickSelector).first();
		if (clickElement.length === 0) {
			return null;
		}

		let jumpUrl: string;
		if (clickElement.is('a')) {
			const href = clickElement.attr('href');
			if (!href) {
				return null;
			}
			jumpUrl = SmartCrawler.resolveUrl(baseUrl, href);
		} else {
			const href = clickElement.attr('href') || clickElement.attr('data-href');
			if (!href) {
				return null;
			}
			jumpUrl = SmartCrawler.resolveUrl(baseUrl, href);
		}

		// 获取跳转页面
		const jumpResponse = await axios.get(jumpUrl, {
			headers: {
				...(cookie && { Cookie: cookie }),
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			},
		});

		const $jump = cheerio.load(jumpResponse.data);
		const targetElement = jumpConfig.targetSelector
			? $jump(jumpConfig.targetSelector).first()
			: $jump('body').first();

		// 如果配置了字段，提取字段数据
		if (jumpConfig.fields && jumpConfig.fields.length > 0) {
			const jumpData: Record<string, unknown> = {};
			for (const jumpField of jumpConfig.fields) {
				try {
					const fieldData: FieldData = {
						name: jumpField.name,
						selector: jumpField.selector,
						type: jumpField.type,
						attribute: jumpField.attribute,
						isJump: jumpField.isJump,
						jumpConfig: jumpField.jumpConfig as Record<string, unknown> | undefined,
					};
					const value = await SmartCrawler.extractField(
						executeFunctions,
						targetElement,
						fieldData,
						jumpUrl,
						cookie,
						jumpLevel + 1,
					);
					jumpData[jumpField.name] = value;
				} catch (error) {
					if (executeFunctions.continueOnFail()) {
						jumpData[jumpField.name] = null;
					} else {
						throw error;
					}
				}
			}
			return jumpData;
		}

		// 如果没有配置字段，返回目标元素的文本内容
		return targetElement.text().trim();
	}

	private static extractValue(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		element: cheerio.Cheerio<any>,
		type: 'text' | 'html' | 'attribute',
		attribute?: string,
	): string | null {
		switch (type) {
			case 'text':
				return element.text().trim() || null;
			case 'html':
				return element.html() || null;
			case 'attribute':
				if (!attribute) {
					return null;
				}
				return element.attr(attribute) || null;
			default:
				return null;
		}
	}

	private static getJumpConfig(
		jumpConfig: Record<string, unknown>,
		level: number,
	): JumpConfig | null {
		if (level === 1 && jumpConfig.firstJump) {
			return SmartCrawler.normalizeJumpConfig(jumpConfig.firstJump as Record<string, unknown>);
		}
		if (level === 2 && jumpConfig.secondJump) {
			return SmartCrawler.normalizeJumpConfig(jumpConfig.secondJump as Record<string, unknown>);
		}
		if (level === 3 && jumpConfig.thirdJump) {
			return SmartCrawler.normalizeJumpConfig(jumpConfig.thirdJump as Record<string, unknown>);
		}
		return null;
	}

	private static normalizeJumpConfig(config: Record<string, unknown>): JumpConfig {
		const normalized: JumpConfig = {
			clickSelector: (config.clickSelector as string) || '',
			targetSelector: config.targetSelector as string | undefined,
			fields: [],
		};

		if (config.fields && typeof config.fields === 'object' && 'field' in config.fields) {
			const fields = (config.fields as { field?: FieldData[] }).field;
			if (fields) {
				normalized.fields = fields.map((f: FieldData): FieldConfig => ({
					name: f.name,
					selector: f.selector,
					type: f.type || 'text',
					attribute: f.attribute,
					isJump: f.isJump || false,
					jumpConfig: f.jumpConfig as JumpConfig | undefined,
				}));
			}
		}

		return normalized;
	}

	private static resolveUrl(baseUrl: string, relativeUrl: string): string {
		try {
			// Use Node.js built-in URL constructor
			const url = new URL(relativeUrl, baseUrl);
			return url.href;
		} catch {
			return relativeUrl;
		}
	}
}
