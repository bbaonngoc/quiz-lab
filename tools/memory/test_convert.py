from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from openpyxl import Workbook

from convert import HEADERS, build_document, source_records, verify_document


class MemoryConverterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "source.xlsx"
        self.workbook = Workbook()
        self.sheet = self.workbook.active
        self.sheet.title = "Trang tính1"
        self.sheet.append([" TIÊU ĐỀ \n"])
        self.sheet.append(HEADERS)
        self.sheet.append([1, "CHƯƠNG 1", "—", "1. Chủ đề", " Nội dung\n  dòng hai ", " Mẹo – nguyên văn "])
        self.sheet.append([2, "CHƯƠNG 1", "PHẦN 2", "1. Chủ đề khác", "Chi tiết", "Mẹo khác"])

    def read(self):
        self.workbook.save(self.path)
        return source_records(self.path, "Trang tính1")

    def test_text_is_preserved_and_source_is_read_only(self):
        title, source, records = self.read()
        original = self.path.read_bytes()
        document = build_document(title, source, records)
        self.assertEqual(verify_document(document, title, source, records), (1, 2, 2))
        self.assertEqual(document["title"], " TIÊU ĐỀ \n")
        self.assertEqual(document["chapters"][0]["sections"][0]["rows"][0]["details"], " Nội dung\n  dòng hai ")
        self.assertEqual(document["chapters"][0]["sections"][0]["rows"][0]["tip"], " Mẹo – nguyên văn ")
        self.assertEqual(self.path.read_bytes(), original)

    def test_missing_field_duplicate_stt_formula_and_extra_column_fail(self):
        for cell, value, message in [("F3", None, "thiếu"), ("A4", 1, "trùng STT"), ("E3", "=1+1", "công thức"), ("G3", "ngoài", "ngoài 6 cột")]:
            with self.subTest(cell=cell):
                previous = self.sheet[cell].value
                self.sheet[cell] = value
                with self.assertRaisesRegex(ValueError, message):
                    self.read()
                self.sheet[cell] = previous

    def test_check_detects_text_rewrite_removed_rows_wrong_group_and_source_hash(self):
        title, source, records = self.read()
        document = build_document(title, source, records)
        for change in [
            lambda d: d["chapters"][0]["sections"][0]["rows"][0].update(details="Nội dung\n  dòng hai"),
            lambda d: d["chapters"][0]["sections"][1]["rows"].clear(),
            lambda d: d["chapters"][0]["sections"][0].update(label="Phần mới"),
            lambda d: d["source"].update(sha256="0" * 64),
        ]:
            mutated = deepcopy(document)
            change(mutated)
            with self.assertRaises(ValueError):
                verify_document(mutated, title, source, records)


if __name__ == "__main__":
    unittest.main()
