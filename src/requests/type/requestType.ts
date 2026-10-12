import { BVID, Category, SponsorTime } from "../../types";

export interface FetchResponse {
    responseText: string;
    status: number;
    ok: boolean;
}

/** 仅控制本地请求行为，不编码到请求体、查询参数或请求头。 */
export interface RequestClientOptions {
    httpsOnly?: boolean;
    /** 默认沿用接口的重试策略；true 允许备用重试，false 禁用重试。 */
    retry?: boolean;
    /** 正文读取上限，单位为字节；不设置时沿用普通文本读取。 */
    maxResponseBytes?: number;
    /** 校验失败与请求失败一样参与重试，不向服务器发送此回调。 */
    validateResponse?: (response: FetchResponse) => boolean;
    /** 默认记录节点失败；false 只跳过失败记录，不禁用重试。 */
    recordFailure?: boolean;
}

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    /** Original candidates retained independently of category, display and action filters. */
    rawSegments?: SponsorTime[];
    status: number;
}

export type LabelBlock = Record<BVID, Category>;
