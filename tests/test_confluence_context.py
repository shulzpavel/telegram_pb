from app.adapters.jira_http import extract_confluence_page_ids


def test_extract_confluence_page_ids_from_common_urls() -> None:
    base = "https://example.atlassian.net/wiki"

    assert extract_confluence_page_ids(
        confluence_base_url=base,
        description="Spec: https://example.atlassian.net/wiki/spaces/ENG/pages/123456/My+Spec",
        description_html='<a href="https://example.atlassian.net/wiki/pages/viewpage.action?pageId=789">legacy</a>',
    ) == ["123456", "789"]


def test_extract_confluence_page_ids_ignores_other_domains() -> None:
    assert extract_confluence_page_ids(
        confluence_base_url="https://example.atlassian.net/wiki",
        description="https://evil.example/wiki/spaces/ENG/pages/123456/Nope",
    ) == []


def test_extract_confluence_page_ids_from_adf_link_marks() -> None:
    adf = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": "Spec",
                        "marks": [
                            {
                                "type": "link",
                                "attrs": {
                                    "href": "https://example.atlassian.net/wiki/spaces/ENG/pages/42/Spec",
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }

    assert extract_confluence_page_ids(
        confluence_base_url="https://example.atlassian.net/wiki",
        description_adf=adf,
    ) == ["42"]
