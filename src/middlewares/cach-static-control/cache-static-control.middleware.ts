export class CacheStaticControlMiddleware {
    static handleCache = (duration) => {
        return (req, res, next) => {
            if (req.method == 'GET') {
                res.set('Cache-control', `public, max-age=${duration}`);
            } else {
                res.set('Cache-control', `no-store`);
            }
            next();
        };
    };
}