import { BVID, Category, SponsorTime } from "../../types";
import type { BackendInfoMap } from "../../backends/types";

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
    /** 校验失败参与重试，最终返回 ok: false 并保留 HTTP 状态和正文；回调仅在本地执行。 */
    validateResponse?: (response: FetchResponse) => boolean;
    /** 默认记录节点失败；false 只跳过失败记录，不禁用重试。 */
    recordFailure?: boolean;
    /** 备用成功后是否切换全局活动节点，默认 true；不影响节点恢复计数。 */
    switchOnRetrySuccess?: boolean;
}

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    /** Original candidates retained independently of category, display and action filters. */
    rawSegments?: SponsorTime[];
    status: number;
    backendInfo?: BackendInfoMap;
}

export type LabelBlock = Record<BVID, Category>;
