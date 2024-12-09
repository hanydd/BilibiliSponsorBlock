export interface BilibiliResponse<T> {
    code: number;
    message: string;
    ttl: number;
    data: T;
}

export interface BiliVideoDetail {
    bvid: string;
    aid: number;
    cid: number;
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

export interface BilibiliPagelistDetail {
    cid: number;
    page: number;
    from: string;
    part: string;
    duration: number;
    vid: string | null;
    weblink: string | null;
    dimension: unknown | null;
    first_frame: string | null;
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
