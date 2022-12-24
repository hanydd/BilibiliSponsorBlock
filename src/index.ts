/** Function that can be used to wait for a condition before returning. */
export async function waitFor<T>(condition: () => T, timeout = 5000, check = 100, predicate?: (obj: T) => boolean): Promise<T> {
    return await new Promise((resolve, reject) => {
        setTimeout(() => {
            clearInterval(interval);
            reject("TIMEOUT");
        }, timeout);

        const intervalCheck = () => {
            const result = condition();
            if (predicate ? predicate(result) : result) {
                resolve(result);
                clearInterval(interval);
            }
        };

        const interval = setInterval(intervalCheck, check);
        
        //run the check once first, this speeds it up a lot
        intervalCheck();
    });
}