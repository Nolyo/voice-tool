.PHONY: install lint format run dev test

install:
	python -m pip install -r requirements.txt

lint:
	ruff check .

format:
	black .
	ruff check . --fix

dev:
	python main.py --console

run:
	python main.py

build-exe:
	pyinstaller --clean --noconfirm packaging/pyinstaller/voice_tool.spec

clean-build:
	python -c "import shutil, os, glob; [shutil.rmtree(p, ignore_errors=True) for p in ('build','dist','__pycache__')]; [os.remove(f) for f in glob.glob('*.spec') if os.path.isfile(f)]"


