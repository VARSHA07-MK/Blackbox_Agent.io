import blackbox


def test_package_imports() -> None:
    assert blackbox.__name__ == "blackbox"
