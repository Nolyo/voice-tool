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


