"""
PDF Translator - 一键安装脚本
运行: python setup.py
功能: 下载 PDF.js 库 + 生成图标
"""
import os
import urllib.request
import struct
import zlib

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join(SCRIPT_DIR, 'lib')
ICONS_DIR = os.path.join(SCRIPT_DIR, 'icons')

PDFJS_VERSION = '3.11.174'
PDFJS_CDN = f'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/{PDFJS_VERSION}'

FILES_TO_DOWNLOAD = {
    'pdf.min.js': f'{PDFJS_CDN}/pdf.min.js',
    'pdf.worker.min.js': f'{PDFJS_CDN}/pdf.worker.min.js',
}


def download_pdfjs():
    """下载 PDF.js 文件到 lib 目录"""
    os.makedirs(LIB_DIR, exist_ok=True)

    print('📥 正在下载 PDF.js...')
    for filename, url in FILES_TO_DOWNLOAD.items():
        filepath = os.path.join(LIB_DIR, filename)
        if os.path.exists(filepath):
            print(f'  ⏭ {filename} 已存在，跳过')
            continue
        print(f'  ⬇ 下载 {filename}...')
        try:
            urllib.request.urlretrieve(url, filepath)
            size = os.path.getsize(filepath)
            print(f'  ✓ {filename} ({size // 1024} KB)')
        except Exception as e:
            print(f'  ✗ 下载失败: {e}')
            return False

    print('✅ PDF.js 下载完成\n')
    return True


def create_png(size, filename):
    """生成图标 PNG"""
    pixels = []
    center = size / 2
    radius = size / 2 - 1

    for y in range(size):
        row = [0]
        for x in range(size):
            dx = x - center + 0.5
            dy = y - center + 0.5
            dist = (dx * dx + dy * dy) ** 0.5

            if dist <= radius:
                nx = dx / radius
                ny = dy / radius

                doc_l, doc_r = -0.42, 0.42
                doc_t, doc_b = -0.52, 0.52

                if doc_l <= nx <= doc_r and doc_t <= ny <= doc_b:
                    fold = 0.18
                    if nx > doc_r - fold and ny < doc_t + fold:
                        diag = (nx - (doc_r - fold)) + (ny - doc_t)
                        if diag < fold:
                            row.extend([210, 215, 225, 255])
                        else:
                            row.extend([30, 80, 160, 255])
                    else:
                        is_line = False
                        for lp in [-0.1, 0.05, 0.20, 0.35]:
                            if abs(ny - lp) < 0.035:
                                if doc_l + 0.08 <= nx <= -0.02:
                                    row.extend([80, 100, 140, 255])
                                    is_line = True
                                    break
                                elif 0.05 <= nx <= doc_r - 0.08:
                                    row.extend([200, 60, 80, 255])
                                    is_line = True
                                    break

                        if not is_line:
                            if abs(nx) < 0.015 and doc_t + 0.15 <= ny <= doc_b - 0.1:
                                row.extend([150, 160, 180, 255])
                            else:
                                row.extend([248, 248, 252, 255])
                else:
                    r_ratio = dist / radius
                    r = int(25 + r_ratio * 15)
                    g = int(80 + r_ratio * 10)
                    b = int(190 - r_ratio * 40)
                    row.extend([r, g, b, 255])
            else:
                row.extend([0, 0, 0, 0])

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


def generate_icons():
    """生成扩展图标"""
    os.makedirs(ICONS_DIR, exist_ok=True)

    print('🎨 正在生成图标...')
    for size in [16, 48, 128]:
        path = os.path.join(ICONS_DIR, f'icon{size}.png')
        create_png(size, path)
        file_size = os.path.getsize(path)
        print(f'  ✓ icon{size}.png ({size}x{size}, {file_size} bytes)')

    print('✅ 图标生成完成\n')


if __name__ == '__main__':
    print('=' * 45)
    print('  PDF Translator - 安装脚本')
    print('=' * 45)
    print()

    success = download_pdfjs()
    if not success:
        print('⚠️  PDF.js 下载失败，请检查网络连接后重试')
        print(f'   也可以手动下载到 {LIB_DIR}/ 目录:')
        for name, url in FILES_TO_DOWNLOAD.items():
            print(f'   - {url}')
        print()

    generate_icons()

    print('=' * 45)
    print('  安装准备完成！')
    print()
    print('  下一步:')
    print('  1. 打开 Chrome → chrome://extensions/')
    print('  2. 开启「开发者模式」')
    print('  3. 点击「加载已解压的扩展程序」')
    print(f'  4. 选择此文件夹: {SCRIPT_DIR}')
    print('=' * 45)
