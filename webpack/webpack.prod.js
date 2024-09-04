/* eslint-disable @typescript-eslint/no-var-requires */
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = env => {
    let mode = "production";
    env.mode = mode;

    return merge(common(env), {
        mode,
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader']
                },
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                }
            ]
        }
    });
};