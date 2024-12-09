export interface BilibiliResponse<T> {
    code: number;
    message: string;
    ttl: number;
    data: T;
}

export interface BiliVideoDetail {}

export interface BiliPlayInfo {
    quality: number;
    dash: {
        video: {
            id: number;
            frameRate: string;
        }[];
    };
}
