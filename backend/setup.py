from setuptools import setup, find_packages
import os

# Read the long description from README.md if available
long_description = ""
if os.path.exists("README.md"):
    with open("README.md", "r", encoding="utf-8") as fh:
        long_description = fh.read()

# Read requirements from requirements.txt
with open("requirements.txt", "r", encoding="utf-8") as f:
    requirements = f.read().splitlines()

setup(
    name="YourProjectName",  # Replace with your project's name
    version="0.1.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="A short description of your project",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/yourproject",  # Replace with your repository URL
    packages=find_packages(),  # Automatically find packages in your project
    install_requires=requirements,  # Install dependencies from requirements.txt
    python_requires=">=3.9, <3.13",  # Enforce Python version
)
