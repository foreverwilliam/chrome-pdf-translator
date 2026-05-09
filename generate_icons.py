"""
PDF Translator - 图标生成脚本
运行: python generate_icons.py
无需安装任何依赖，使用 Python 标准库
"""
import struct
import zlib
import os

def create_png(size, filename):
    """生成一个简洁的翻译器图标 PNG"""
    pixels = []
    center = size / 2
    radius = size / 2 - 1

    for y in range(size):
        row = [0]  # PNG filter byte
        for x in range(size):
            dx = x - center + 0.5
            dy = y - center + 0.5
            dist = (dx * dx + dy * dy) ** 0.5

            if dist <= radius:
                # 归一化坐标
                nx = dx / radius
                ny = dy / radius

                # 文档区域
                doc_l, doc_r = -0.42, 0.42
                doc_t, doc_b = -0.52, 0.52

                if doc_l <= nx <= doc_r and doc_t <= ny <= doc_b:
                    # 折角
                    fold = 0.18
                    if nx > doc_r - fold and ny < doc_t + fold:
                        diag = (nx - (doc_r - fold)) + (ny - doc_t)
                        if diag < fold:
                            row.extend([210, 215, 225, 255])
                        else:
                            row.extend([30, 80, 160, 255])
                    else:
                        # 文档内部 - 画几条线代表文字
                        is_line = False
                        line_positions = [-0.1, 0.05, 0.20, 0.35]
                        for lp in line_positions:
                            if abs(ny - lp) < 0.035:
                                # 左半区域线条（原文）
                                if doc_l + 0.08 <= nx <= -0.02:
                                    row.extend([80, 100, 140, 255])
                                    is_line = True
                                    break
                                # 右半区域线条（译文，红色标记）
                                elif 0.05 <= nx <= doc_r - 0.08:
                                    row.extend([200, 60, 80, 255])
                                    is_line = True
                                    break

                        if not is_line:
                            # 中间分隔线
                            if abs(nx - 0.0) < 0.015 and doc_t + 0.15 <= ny <= doc_b - 0.1:
                                row.extend([150, 160, 180, 255])
                            else:
                                row.extend([248, 248, 252, 255])
                else:
                    # 圆形背景 - 渐变蓝色
                    r_ratio = dist / radius
                    r = int(25 + r_ratio * 15)
                    g = int(80 + r_ratio * 10)
                    b = int(190 - r_ratio * 40)
                    row.extend([r, g, b, 255])
            else:
                row.extend([0, 0, 0, 0])  # 透明

        pixels.append(bytes(row))

    raw = b''.join(pixels)

    def make_chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    png_data = b'\x89PNG\r\n\x1a\n'
    png_data += make_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png_data += make_chunk(b'IDAT', zlib.compress(raw, 9))
    png_data += make_chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png_data)
    print(f'  ✓ {filename} ({size}x{size}, {len(png_data)} bytes)')


if __name__ == '__main__':
    # 确保输出到 icons 目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(script_dir, 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    print('正在生成图标...')
    create_png(16, os.path.join(icons_dir, 'icon16.png'))
    create_png(48, os.path.join(icons_dir, 'icon48.png'))
    create_png(128, os.path.join(icons_dir, 'icon128.png'))
    print('\n图标生成完成！')
