import numpy as np
def raster(xy, z, N, M=None, attr=None, init=-1e9):
    """xy:(F,3,2) pixel coords, z:(F,3) depth (bigger=closer). returns zbuf, face id buf, bary buf"""
    M = M or N
    zb = np.full((M, N), init); fid = np.full((M, N), -1, np.int64); bar = np.zeros((M, N, 3), np.float32)
    mn = np.floor(xy.min(1)).astype(int); mx = np.ceil(xy.max(1)).astype(int)
    for i in range(len(xy)):
        x0, y0 = max(mn[i, 0], 0), max(mn[i, 1], 0); x1, y1 = min(mx[i, 0], N - 1), min(mx[i, 1], M - 1)
        if x1 < x0 or y1 < y0: continue
        a, b, c = xy[i]
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        w1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
        w2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
        w3 = 1 - w1 - w2
        e = -1e-4
        ins = (w1 >= e) & (w2 >= e) & (w3 >= e)
        zz = w1 * z[i, 0] + w2 * z[i, 1] + w3 * z[i, 2]
        sub = zb[y0:y1 + 1, x0:x1 + 1]; upd = ins & (zz > sub)
        sub[upd] = zz[upd]; fid[y0:y1 + 1, x0:x1 + 1][upd] = i
        bar[y0:y1 + 1, x0:x1 + 1][upd] = np.stack([w1, w2, w3], -1)[upd]
    return zb, fid, bar
