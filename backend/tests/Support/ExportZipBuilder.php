<?php

namespace Tests\Support;

use App\Support\BoxCode;
use Illuminate\Support\Str;
use ZipArchive;

/**
 * Builds phone export ZIPs exactly like the mobile app (see shared/manifest.schema.json),
 * with hooks to break them in specific ways.
 */
class ExportZipBuilder
{
    private string $exportId;
    private array $boxes = [];
    private array $voided = [];
    private array $open = [];
    private ?int $lastIssued = null;
    private string $appVersion = '1.0.0';
    /** @var array<string, string> file name => bytes overriding the real photo */
    private array $tamper = [];
    /** @var string[] */
    private array $omit = [];
    private array $manifestOverrides = [];

    public function __construct(private string $device = 'A', private string $agent = 'Agent Test')
    {
        $this->exportId = (string) Str::uuid();
    }

    public static function make(string $device = 'A'): self
    {
        return new self($device);
    }

    public function exportId(string $id): self
    {
        $this->exportId = $id;

        return $this;
    }

    /** Adds a box with one code photo + ($photos - 1) document photos. $seed changes the image bytes. */
    public function box(int $sequence, int $photos = 3, int $seed = 0, ?string $code = null): self
    {
        $code ??= BoxCode::make($this->device, $sequence)->value();
        $list = [];
        for ($i = 0; $i < $photos; $i++) {
            $file = sprintf('boxes/%s/%03d%s.jpg', $code, $i, $i === 0 ? '_code' : '');
            $bytes = self::jpeg($sequence * 1000 + $i + $seed * 100000);
            $list[] = ['file' => $file, 'bytes' => $bytes, 'sequence' => $i];
        }
        $this->boxes[] = ['code' => $code, 'sequence' => $sequence, 'photos' => $list];

        return $this;
    }

    public function voided(int ...$sequences): self
    {
        $this->voided = $sequences;

        return $this;
    }

    public function open(int ...$sequences): self
    {
        $this->open = $sequences;

        return $this;
    }

    public function lastIssued(int $value): self
    {
        $this->lastIssued = $value;

        return $this;
    }

    public function appVersion(string $version): self
    {
        $this->appVersion = $version;

        return $this;
    }

    /** Replaces the bytes of one photo inside the ZIP (checksum in the manifest stays the original). */
    public function corrupt(string $file): self
    {
        $this->tamper[$file] = self::jpeg(999999);

        return $this;
    }

    public function omit(string $file): self
    {
        $this->omit[] = $file;

        return $this;
    }

    public function withManifest(array $overrides): self
    {
        $this->manifestOverrides = $overrides;

        return $this;
    }

    public function manifest(): array
    {
        $sequences = array_column($this->boxes, 'sequence');
        $manifest = [
            'format_version' => 1,
            'export_id' => $this->exportId,
            'device_letter' => $this->device,
            'agent_name' => $this->agent,
            'app_version' => $this->appVersion,
            'exported_at' => '2026-10-22T18:00:00+01:00',
            'sequence_range' => [
                'from' => $sequences ? min($sequences) : null,
                'to' => $sequences ? max($sequences) : null,
                'last_issued' => $this->lastIssued ?? max([0, ...$sequences, ...$this->voided, ...$this->open]),
            ],
            'voided_sequences' => $this->voided,
            'open_sequences' => $this->open,
            'boxes' => array_map(fn ($box) => [
                'code' => $box['code'],
                'sequence' => $box['sequence'],
                'location' => ['room' => 'Salle 1', 'shelf' => 'B', 'row' => null],
                'created_at' => '2026-10-22T09:00:00+01:00',
                'closed_at' => '2026-10-22T09:30:00+01:00',
                'photos' => array_map(fn ($p) => [
                    'sequence' => $p['sequence'],
                    'type' => $p['sequence'] === 0 ? 'code_photo' : 'document',
                    'file' => $p['file'],
                    'sha256' => hash('sha256', $p['bytes']),
                    'width' => 64,
                    'height' => 48,
                    'taken_at' => '2026-10-22T09:10:00+01:00',
                    'quality' => ['sharpness' => 120.5, 'brightness' => 180, 'override' => false, 'cropped' => $p['sequence'] > 0],
                ], $box['photos']),
            ], $this->boxes),
        ];

        return array_replace_recursive($manifest, $this->manifestOverrides);
    }

    public function build(string $path): string
    {
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('manifest.json', json_encode($this->manifest(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        foreach ($this->boxes as $box) {
            foreach ($box['photos'] as $photo) {
                if (! in_array($photo['file'], $this->omit, true)) {
                    $zip->addFromString($photo['file'], $this->tamper[$photo['file']] ?? $photo['bytes']);
                }
            }
        }
        $zip->close();

        return $path;
    }

    /** A small, valid JPEG whose bytes depend on $seed. */
    public static function jpeg(int $seed): string
    {
        $img = imagecreatetruecolor(64, 48);
        imagefill($img, 0, 0, imagecolorallocate($img, $seed % 256, intdiv($seed, 256) % 256, intdiv($seed, 65536) % 256));
        imagestring($img, 2, 2, 2, (string) $seed, imagecolorallocate($img, 255, 255, 255));
        ob_start();
        imagejpeg($img, null, 80);
        imagedestroy($img);

        return ob_get_clean();
    }
}
