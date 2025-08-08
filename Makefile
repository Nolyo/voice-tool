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
	rm -rf build dist __pycache__ *.spec


