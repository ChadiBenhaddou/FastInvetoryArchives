<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Box;
use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\CSV\Writer as CsvWriter;
use OpenSpout\Writer\WriterInterface;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Inventory export: Excel (sheets "Boîtes" and "Documents") or CSV (one sheet per file).
 * Streamed row by row (100k+ documents), downloaded by the browser: the user chooses where
 * to save it, e.g. a USB drive.
 */
class ExportController extends Controller
{
    private const EXCEL_CELL_MAX = 32000; // Excel refuses cells over 32 767 characters

    public function __invoke(Request $request): BinaryFileResponse
    {
        $data = $request->validate([
            'format' => ['required', Rule::in(['xlsx', 'csv'])],
            'sheet' => ['nullable', Rule::in(['boxes', 'documents'])], // CSV: one sheet per file
        ]);
        $format = $data['format'];
        $sheet = $data['sheet'] ?? 'documents';
        $stamp = now()->format('Ymd_Hi');
        $name = $format === 'xlsx' ? "inventaire_{$stamp}.xlsx" : "inventaire_{$sheet}_{$stamp}.csv";
        $path = storage_path("app/exports/{$name}");
        @mkdir(dirname($path), 0775, true);

        $writer = $format === 'xlsx' ? new XlsxWriter : new CsvWriter;
        $writer->openToFile($path);
        if ($format === 'xlsx') {
            $writer->getCurrentSheet()->setName('Boîtes');
            $this->boxes($writer);
            $writer->addNewSheetAndMakeItCurrent()->setName('Documents');
            $this->documents($writer);
        } else {
            $sheet === 'boxes' ? $this->boxes($writer) : $this->documents($writer);
        }
        $writer->close();

        AuditLog::record('export', 'inventory', null, ['file' => $name]);

        return response()->download($path, $name)->deleteFileAfterSend();
    }

    private function header(WriterInterface $writer, array $titles): void
    {
        $writer->addRow(Row::fromValuesWithStyle($titles, (new Style)->withFontBold(true)));
    }

    private function boxes(WriterInterface $writer): void
    {
        $this->header($writer, ['Code', 'Statut', 'Appareil', 'Agent', 'Salle', 'Étagère', 'Rangée',
            'Photos', 'Documents', 'Signalés', 'Créée le', 'Fermée le', 'Import n°']);

        Box::with('device')
            ->withCount(['documents', 'documents as to_review' => fn ($q) => $q->where('needs_review', true)->whereNull('reviewed_at')])
            ->orderBy('code')
            ->chunk(1000, function ($boxes) use ($writer) {
                foreach ($boxes as $b) {
                    $writer->addRow(Row::fromValues([
                        $b->code, $b->status->value, $b->device?->letter, $b->agent_name, $b->room, $b->shelf, $b->row,
                        $b->photo_count, $b->documents_count, $b->to_review,
                        $b->created_on_phone_at?->format('Y-m-d H:i'), $b->closed_at?->format('Y-m-d H:i'), $b->import_id,
                    ]));
                }
            });
    }

    private function documents(WriterInterface $writer): void
    {
        $this->header($writer, ['Boîte', 'Salle', 'Étagère', 'Rangée', 'Photo n°', 'Type', 'Titre', 'Date', 'Référence',
            'Personnes', 'Organismes', 'Mots-clés', 'Résumé', 'Langue', 'Manuscrit', 'Confiance OCR', 'Confiance extraction',
            'Signalé', 'Motifs', 'Corrigé par', 'Corrigé le', 'Texte OCR']);

        Document::with(['box', 'image', 'reviewer'])
            ->join('boxes', 'boxes.id', '=', 'documents.box_id')
            ->join('images', 'images.id', '=', 'documents.image_id')
            ->orderBy('boxes.code')->orderBy('images.sequence')
            ->select('documents.*')
            ->chunk(500, function ($docs) use ($writer) {
                foreach ($docs as $d) {
                    $writer->addRow(Row::fromValues([
                        $d->box->code, $d->box->room, $d->box->shelf, $d->box->row, $d->image?->sequence,
                        $d->doc_type, $d->title, $d->doc_date?->format('Y-m-d'), $d->reference_number,
                        implode(' ; ', $d->persons ?? []), implode(' ; ', $d->organizations ?? []), implode(' ; ', $d->keywords ?? []),
                        $d->summary, $d->language, $d->is_handwritten ? 'oui' : 'non',
                        $d->ocr_confidence, $d->extraction_confidence,
                        $d->needs_review && ! $d->reviewed_at ? 'oui' : 'non', implode(', ', $d->review_reasons ?? []),
                        $d->reviewer?->name, $d->reviewed_at?->format('Y-m-d H:i'),
                        mb_substr((string) $d->ocr_text, 0, self::EXCEL_CELL_MAX),
                    ]));
                }
            });
    }
}
