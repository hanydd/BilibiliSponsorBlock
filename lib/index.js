"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wait = void 0;
/** Function that can be used to wait for a condition before returning. */
function wait(condition, timeout = 5000, check = 100, predicate) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield new Promise((resolve, reject) => {
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
    });
}
exports.wait = wait;
//# sourceMappingURL=index.js.map