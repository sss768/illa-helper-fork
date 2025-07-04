/**
 * Google Gemini 翻译提供者
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { FullTextAnalysisResponse } from '../../shared/types/api';
import { UserSettings } from '../../shared/types/storage';
import { BaseProvider } from '../base/BaseProvider';
import { mergeCustomParams } from '../utils/apiUtils';
import { addPositionsToReplacements } from '../utils/textUtils';
import { getSystemPromptByConfig } from '../../promptManager';
import {
  extractAndParseJson,
  getApiTimeout,
  mapParamsForProvider,
} from '@/src/utils';
import { rateLimitManager } from '../../rateLimit';

/**
 * Google Gemini API 提供者实现
 */
export class GoogleGeminiProvider extends BaseProvider {
  protected getProviderName(): string {
    return 'Google Gemini';
  }

  protected async doAnalyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    const genAI = new GoogleGenerativeAI(this.config.apiKey);

    // 基础生成配置
    const baseGenerationConfig: any = {
      responseMimeType: 'application/json',
      temperature: this.config.temperature,
    };

    // 从 customParams 合并额外参数
    let generationConfig = mergeCustomParams(
      baseGenerationConfig,
      this.config.customParams,
    );

    // 适配参数
    generationConfig = mapParamsForProvider(generationConfig, 'gemini');

    // 请求选项，如超时和代理端点
    const requestOptions: { timeout?: number; baseUrl?: string } = {};
    const timeout = getApiTimeout(settings.apiRequestTimeout);
    if (timeout) {
      requestOptions.timeout = timeout;
    }
    if (this.config.apiEndpoint) {
      requestOptions.baseUrl = this.config.apiEndpoint;
    }

    const model = genAI.getGenerativeModel(
      {
        model: this.config.model,
        generationConfig,
      },
      requestOptions,
    );

    const systemPrompt = getSystemPromptByConfig({
      translationDirection: 'intelligent',
      targetLanguage: settings.multilingualConfig.targetLanguage,
      userLevel: settings.userLevel,
      replacementRate: settings.replacementRate,
      intelligentMode: true,
      provider: 'gemini', // 指定为gemini获取特定prompt
    });

    const prompt = `${systemPrompt}\n\n${text}`;
    console.log('Gemini Prompt:', prompt);

    const rateLimiter = rateLimitManager.getLimiter(
      this.config.apiEndpoint || 'google-gemini-native',
      this.config.requestsPerSecond || 0,
      true,
    );

    const apiRequestFunction = () => model.generateContent(prompt);

    const [result] = await rateLimiter.executeBatch([apiRequestFunction]);
    const response = result.response;
    const responseText = response.text();
    console.log('Gemini Response Text:', responseText);

    const content = extractAndParseJson(responseText);
    console.log('Parsed Gemini Content:', content);

    const replacements = addPositionsToReplacements(
      text,
      content.replacements || [],
    );

    return {
      original: text,
      processed: '',
      replacements,
    };
  }
}
