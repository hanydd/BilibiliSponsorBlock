import { AID, BVID, CID } from "../../types";

export interface BilibiliResponse<T> {
    code: number;
    message: string;
    ttl: number;
    data: T;
}

export interface BiliVideoDetail {
    bvid: BVID;
    aid: AID;
    cid: CID;
    owner: {
        mid: number;
        name: string;
        face: string;
    };

    videos: number;
    pages: BilibiliPagelistDetail[];

    tid: number;
    tname: string;
    copyright: number;
    pic: string;
    title: string;
    pubdate: number;
    ctime: number;
    desc: string;
    desc_v2: {
        raw_text: string;
        type: number;
        biz_id: number;
    }[];
    state: number;
    duration: number;
}

export interface BiliVideoDetailForEvent {
    bvid: BVID;
    aid: AID;
    cid: CID;
    copyright: number;
    desc: string;
    danmakuCount: number;
    enableVt: boolean;
    his_rank: number;
    noReprint: number;
    pages: BilibiliPagelistDetailForEvent[];
    pubdate: number;
    title: string;
    upMid: number;
    upName: string;
    viewCount: number;
    vt: number;
    vtDisplay: string;
}

export interface BilibiliPagelistDetail {
    cid: CID;
    page: number;
    from: string;
    part: string;
    duration: number;
    vid: string | null;
    weblink: string | null;
    dimension: unknown | null;
    first_frame: string | null;
}

export interface BilibiliPagelistDetailForEvent {
    cid: CID;
    dimension: {
        height: number;
        rotate: number;
        width: number;
    };
    duration: number;
    from: string;
    page: number;
    part: string;
    vid: string;
    weblink: string;
}

export interface BiliPlayInfo {
    quality: number;
    dash: {
        video: {
            id: number;
            frameRate: string;
        }[];
    };
}
