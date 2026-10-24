"""Conversion of a oneocr result into the app contract. No DLL needed:
    py -3.12 -m unittest discover -s windows-ocr/tests -t windows-ocr
"""

import unittest

from ocr_result import ENGINE_NAME, handwriting, language_of, to_app_result


def word(text, conf):
    return {"text": text, "confidence": conf, "bounding_rect": None}


def line(text, words, x1=10, y1=10, x2=300, y2=40):
    rect = {"x1": x1, "y1": y1, "x2": x2, "y2": y1 + 1, "x3": x2 - 0.4, "y3": y2, "x4": x1 + 0.6, "y4": y2 - 1}
    return {"text": text, "bounding_rect": rect, "words": words}


RAW = {
    "text_angle": 358.5,
    "lines": [
        line("قرار رقم 2019/145", [word("قرار", 0.9), word("رقم", 0.8), word("2019/145", 1.0)], y1=10, y2=40),
        line("Direction des Archives", [word("Direction", 1.0), word("des", 1.0), word("Archives", 0.5)], y1=50, y2=80),
        line("   ", [], y1=90, y2=100),
        {"text": None, "bounding_rect": None, "words": []},
    ],
}


class ToAppResultTest(unittest.TestCase):
    def setUp(self):
        self.result = to_app_result(RAW, 1500, 2000)

    def test_same_fields_as_the_docker_worker(self):
        for key in ("text", "language", "confidence", "is_handwritten", "handwriting_score", "blocks",
                    "engine", "rotation", "skew", "width", "height", "duration_ms"):
            self.assertIn(key, self.result)
        self.assertEqual(self.result["engine"], ENGINE_NAME)
        self.assertEqual((self.result["width"], self.result["height"]), (1500, 2000))

    def test_empty_lines_are_dropped_and_text_kept_in_logical_order(self):
        self.assertEqual(self.result["text"], "قرار رقم 2019/145\nDirection des Archives")
        self.assertEqual([b["script"] for b in self.result["blocks"]], ["ar", "latin"])

    def test_bbox_is_the_axis_aligned_box_of_the_quadrilateral(self):
        self.assertEqual(self.result["blocks"][0]["bbox"], [10, 10, 300, 40])

    def test_line_confidence_is_weighted_by_word_length(self):
        # 4 letters at 0.9, 3 at 0.8, 8 at 1.0 → 14.0 / 15
        self.assertAlmostEqual(self.result["blocks"][0]["confidence"], round(14.0 / 15, 4))
        # 9 at 1.0, 3 at 1.0, 8 at 0.5 → 16 / 20
        self.assertAlmostEqual(self.result["blocks"][1]["confidence"], 0.8)

    def test_page_confidence_is_weighted_by_line_length(self):
        blocks = self.result["blocks"]
        total = sum(len(b["text"]) for b in blocks)
        expected = sum(b["confidence"] * len(b["text"]) for b in blocks) / total
        self.assertAlmostEqual(self.result["confidence"], round(expected, 4))

    def test_engine_angle_is_kept_signed_and_nothing_is_rotated(self):
        self.assertEqual(self.result["text_angle"], -1.5)
        self.assertEqual((self.result["rotation"], self.result["skew"]), (0, 0.0))

    def test_empty_result(self):
        empty = to_app_result({"text": "", "text_angle": None, "lines": []}, 100, 100)
        self.assertEqual((empty["text"], empty["confidence"], empty["language"]), ("", 0.0, None))
        self.assertIsNone(empty["text_angle"])


class HeuristicsTest(unittest.TestCase):
    def test_language(self):
        self.assertEqual(language_of("مديرية الأرشيف"), "ar")
        self.assertEqual(language_of("Direction des archives"), "fr")
        self.assertEqual(language_of("Direction مديرية الأرشيف"), "mixed")
        self.assertIsNone(language_of("2019/145"))

    def test_regular_confident_lines_are_not_handwriting(self):
        lines = [{"text": "abcdefgh", "bbox": [0, y, 100, y + 30], "confidence": 0.97} for y in (0, 40, 80, 120)]
        self.assertFalse(handwriting(lines)[1])

    def test_irregular_unsure_lines_look_handwritten(self):
        lines = [{"text": "abcdefgh", "bbox": [0, 0, 100, h], "confidence": 0.5} for h in (20, 70, 35, 110)]
        self.assertTrue(handwriting(lines)[1])


if __name__ == "__main__":
    unittest.main()
